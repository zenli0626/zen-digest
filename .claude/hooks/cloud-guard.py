#!/usr/bin/env python3
"""Cloud-session guard (PreToolUse hook).

Only active when CLAUDE_CODE_REMOTE=true (Claude Code on the web). On Zen's Mac it
exits 0 immediately; the Mac has its own guards in ~/.claude/hooks.

Blocks (exit 2) the actions that can move money, reach production, or contact
families from an unattended cloud session:
  - every Robinhood tool
  - Vercel writes (deploy / promote / rollback / env / domains); reads stay allowed
  - Supabase migrations, branch/project changes, and any non-SELECT SQL
  - sending or deleting email, calendar invites, Drive sharing/trash, Sheets writes,
    SignWell sends, Meta Ads changes, Stripe writes
  - git push to main/master, force or delete pushes, immediate `gh pr merge`,
    gh secret/repo admin, `gh api` PUT/PATCH/DELETE, prod CLI deploys, live keys
Reads, drafts, previews, feature-branch pushes and PRs are allowed.
"""
import json
import os
import re
import subprocess
import sys

READ_PREFIXES = ("get", "list", "search", "read", "retrieve", "fetch", "count",
                 "aggregate", "filter", "check", "web_fetch", "explain", "query")

SQL_WRITE = re.compile(
    r"\b(insert|update|delete|merge|upsert|alter|drop|create|truncate|grant|revoke|"
    r"vacuum|reindex|cluster|refresh|copy|comment\s+on|call\s+\w|do\s+\$|set\s+role|"
    r"lock|security\s+label)\b", re.I)


def _strip_sql_comments(q: str) -> str:
    q = re.sub(r"/\*.*?\*/", " ", q, flags=re.S)
    return re.sub(r"--[^\n]*", " ", q)


def _mcp(tool: str, inp: dict):
    low = tool.lower()
    name = low.rsplit("__", 1)[-1]
    is_read = name.startswith(READ_PREFIXES)

    if "robinhood" in low:
        return "Robinhood tools are disabled in cloud sessions (live brokerage)."
    if "vercel" in low and not is_read:
        return f"Vercel write '{name}' is disabled in cloud sessions (production hosting)."
    if "supabase" in low:
        if name in ("execute_sql", "run_sql", "query"):
            q = _strip_sql_comments(str(inp.get("query") or inp.get("sql") or ""))
            if SQL_WRITE.search(q):
                return "Only read-only SQL (SELECT) is allowed in cloud sessions."
            return None
        if not is_read:
            return f"Supabase '{name}' is disabled in cloud sessions (live databases)."
    if "gmail" in low and re.search(r"send|reply|forward|trash|delete|spam", name):
        return "Sending or deleting email is disabled in cloud sessions; create a draft instead."
    if "calendar" in low and re.search(r"create|update|delete|respond", name):
        return "Calendar changes (they email invitees) are disabled in cloud sessions."
    if "drive" in low and re.search(r"share|trash|delete|permission", name):
        return "Drive sharing/trash is disabled in cloud sessions."
    if "sheets" in low and re.search(r"update|append|clear|insert|copy|batch", name):
        return "Writing to Google Sheets is disabled in cloud sessions (the planning sheet is the source of truth)."
    if "signwell" in low and re.search(r"create|send|update|delete|reminder|store", name):
        return "SignWell sends/changes are disabled in cloud sessions."
    if ("meta-ads" in low or "meta_ads" in low) and not re.search(
            r"get|list|search|insights|preview|read|check|log_ui", name):
        return "Meta Ads changes are disabled in cloud sessions."
    if "stripe" in low and not is_read and name not in ("search_stripe_documentation", "search_documentation"):
        return "Stripe writes are disabled in cloud sessions (live payments)."
    return None


def _default_branch() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"],
                              capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:
        return ""


def _bash(cmd: str, current_branch):
    if re.search(r"\b(sk|rk)_live_[A-Za-z0-9]", cmd):
        return "Live Stripe keys must never be used from a cloud session."

    for seg in re.split(r"&&|\|\||;|\|", cmd):
        s = seg.strip()
        if re.search(r"\bgit\s+push\b", s):
            args = s.split()
            if any(a in ("-f", "--force", "--force-with-lease", "--delete", "-d", "--mirror")
                   or a.startswith("--force") for a in args):
                return "Force/delete pushes are disabled in cloud sessions."
            refspecs = [a for a in args[args.index("push") + 1:] if not a.startswith("-")][1:]
            for r in refspecs:
                if r.startswith(":"):
                    return "Deleting a remote branch is disabled in cloud sessions."
                dst = r.split(":")[-1].replace("refs/heads/", "").lstrip("+")
                if dst in ("main", "master"):
                    return "Pushing to main/master is disabled: main is production. Push a branch and open a PR."
            if not refspecs and current_branch() in ("main", "master"):
                return "You are on main: pushing it is disabled. Create a branch and open a PR."
        if re.search(r"\bvercel\b", s) and re.search(
                r"--prod\b|\bpromote\b|\brollback\b|\balias\s+set\b|\benv\s+(add|rm|remove)\b|\bdomains?\b|\bremove\b|\brm\b", s):
            return "Production Vercel commands are disabled in cloud sessions; a branch push gives you a preview."
        if re.search(r"\bsupabase\b", s) and re.search(
                r"\bdb\s+(push|reset)\b|\bmigration\s+(up|repair)\b|\bfunctions\s+deploy\b|\bsecrets\s+set\b", s):
            return "Supabase deploy/migration commands are disabled in cloud sessions."
        if re.search(r"\bgh\s+pr\s+merge\b", s) and "--auto" not in s:
            return "Immediate merges are disabled; queue with `gh pr merge <n> --squash --auto` or leave it for Zen."
        if re.search(r"\bgh\s+pr\s+merge\b", s) and "--admin" in s:
            return "`--admin` merges are disabled in cloud sessions."
        if re.search(r"\bgh\s+(secret|variable)\b", s) or re.search(
                r"\bgh\s+repo\s+(delete|edit|archive|rename)\b", s):
            return "GitHub secrets/repo settings are disabled in cloud sessions."
        if re.search(r"\bgh\s+api\b", s) and re.search(r"(-X|--method)\s*(PUT|PATCH|DELETE)\b", s, re.I):
            return "Write calls through `gh api` are disabled in cloud sessions."
    return None


def decide(tool: str, inp: dict, current_branch=_default_branch):
    """Return a block reason, or None to allow."""
    if tool.startswith("mcp__"):
        return _mcp(tool, inp or {})
    if tool == "Bash":
        return _bash(str((inp or {}).get("command", "")), current_branch)
    return None


def main() -> int:
    if os.environ.get("CLAUDE_CODE_REMOTE") != "true":
        return 0
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    reason = decide(payload.get("tool_name", ""), payload.get("tool_input") or {})
    if reason:
        print(f"BLOCKED by .claude/hooks/cloud-guard.py: {reason} "
              "Do not try to work around this; tell Zen what you needed.", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())

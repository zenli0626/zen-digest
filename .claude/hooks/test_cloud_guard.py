"""Tests for cloud-guard.py. Run: python3 .claude/hooks/test_cloud_guard.py"""
import importlib.util
import os
import unittest

_spec = importlib.util.spec_from_file_location(
    "cloud_guard", os.path.join(os.path.dirname(__file__), "cloud-guard.py"))
cg = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cg)


def blocked(tool, inp=None, branch="claude/some-branch"):
    return cg.decide(tool, inp or {}, current_branch=lambda: branch) is not None


class McpTools(unittest.TestCase):
    def test_robinhood_everything_blocked(self):
        for t in ["mcp__claude_ai_Robinhood__place_equity_order",
                  "mcp__Robinhood__get_portfolio",
                  "mcp__robinhood__cancel_crypto_order"]:
            self.assertTrue(blocked(t), t)

    def test_vercel_reads_allowed_writes_blocked(self):
        for t in ["mcp__claude_ai_Vercel__get_deployment", "mcp__Vercel__list_projects",
                  "mcp__claude_ai_Vercel__get_runtime_logs", "mcp__claude_ai_Vercel__web_fetch_vercel_url"]:
            self.assertFalse(blocked(t), t)
        for t in ["mcp__claude_ai_Vercel__create_deployment", "mcp__claude_ai_Vercel__request_promote",
                  "mcp__claude_ai_Vercel__request_rollback", "mcp__claude_ai_Vercel__edit_project_env",
                  "mcp__plugin_vercel_vercel__deploy_to_vercel", "mcp__claude_ai_Vercel__buy_domain"]:
            self.assertTrue(blocked(t), t)

    def test_supabase_select_allowed_writes_blocked(self):
        sql = "mcp__claude_ai_Supabase__execute_sql"
        self.assertFalse(blocked(sql, {"query": "select id, updated_at, created_at from families limit 5"}))
        self.assertTrue(blocked(sql, {"query": "update families set name='x' where id=1"}))
        self.assertTrue(blocked(sql, {"query": "/* hi */ DELETE FROM payments"}))
        self.assertTrue(blocked(sql, {"query": "with x as (select 1) insert into t select * from x"}))
        self.assertTrue(blocked(sql, {"query": "drop table t"}))
        self.assertTrue(blocked("mcp__supabase__apply_migration", {"query": "select 1"}))
        self.assertFalse(blocked("mcp__supabase__list_tables"))

    def test_messages_and_sharing_blocked_drafts_allowed(self):
        for t in ["mcp__claude_ai_Gmail__send_message", "mcp__claude_ai_Gmail__reply",
                  "mcp__claude_ai_Gmail__forward", "mcp__claude_ai_Gmail__trash_thread",
                  "mcp__claude_ai_Google_Calendar__create_event", "mcp__claude_ai_Google_Calendar__respond_to_event",
                  "mcp__claude_ai_Google_Drive__share_file", "mcp__claude_ai_Google_Drive__trash_file",
                  "mcp__claude_ai_Google_Sheets__update_values", "mcp__claude_ai_Google_Sheets__append_values",
                  "mcp__signwell__document_create", "mcp__signwell__document_send_draft",
                  "mcp__meta-ads__ads_create_campaign", "mcp__meta-ads__ads_activate_entity"]:
            self.assertTrue(blocked(t), t)
        for t in ["mcp__claude_ai_Gmail__create_draft", "mcp__claude_ai_Gmail__search_threads",
                  "mcp__claude_ai_Google_Calendar__list_events", "mcp__claude_ai_Google_Drive__search_files",
                  "mcp__claude_ai_Google_Sheets__get_values", "mcp__signwell__document_list",
                  "mcp__meta-ads__ads_get_ad_entities", "mcp__claude_ai_Granola__get_meetings"]:
            self.assertFalse(blocked(t), t)

    def test_stripe_reads_allowed_writes_blocked(self):
        self.assertFalse(blocked("mcp__plugin_stripe_stripe__list_customers"))
        self.assertFalse(blocked("mcp__plugin_stripe_stripe__retrieve_balance"))
        self.assertTrue(blocked("mcp__plugin_stripe_stripe__create_refund"))
        self.assertTrue(blocked("mcp__plugin_stripe_stripe__update_subscription"))


class BashCommands(unittest.TestCase):
    def b(self, cmd, branch="claude/x"):
        return blocked("Bash", {"command": cmd}, branch=branch)

    def test_push_feature_branch_allowed(self):
        self.assertFalse(self.b("git push -u origin claude/fix-thing"))
        self.assertFalse(self.b("git push"))  # on a claude/ branch

    def test_push_to_main_blocked(self):
        self.assertTrue(self.b("git push origin main"))
        self.assertTrue(self.b("git push origin HEAD:main"))
        self.assertTrue(self.b("git push origin HEAD:refs/heads/master"))
        self.assertTrue(self.b("git push", branch="main"))
        self.assertTrue(self.b("cd x && git push origin feat:main"))

    def test_force_and_delete_push_blocked(self):
        self.assertTrue(self.b("git push --force origin claude/x"))
        self.assertTrue(self.b("git push -f"))
        self.assertTrue(self.b("git push --force-with-lease"))
        self.assertTrue(self.b("git push origin --delete claude/x"))
        self.assertTrue(self.b("git push origin :claude/x"))

    def test_deploy_and_db_cli_blocked(self):
        for c in ["vercel --prod", "npx vercel deploy --prod --yes", "vercel promote dpl_123",
                  "vercel rollback", "vercel alias set a b", "vercel env add FOO production",
                  "supabase db push", "npx supabase migration up", "supabase functions deploy x",
                  "supabase secrets set A=b"]:
            self.assertTrue(self.b(c), c)
        for c in ["vercel", "npx vercel build", "vercel ls", "supabase db diff", "npm run build"]:
            self.assertFalse(self.b(c), c)

    def test_merge_must_be_auto_and_gh_writes_blocked(self):
        self.assertTrue(self.b("gh pr merge 12 --squash"))
        self.assertFalse(self.b("gh pr merge 12 --squash --auto"))
        self.assertFalse(self.b("gh pr create --title t --body b"))
        self.assertTrue(self.b("gh secret set FOO"))
        self.assertTrue(self.b("gh repo delete x/y --yes"))
        self.assertTrue(self.b("gh api -X DELETE repos/x/y/branches/main/protection"))
        self.assertFalse(self.b("gh api repos/x/y/pulls"))

    def test_live_keys_blocked(self):
        # Built at runtime so secret scanners don't flag a fake key in source.
        live = "_".join(["sk", "live", "abc123"])
        restricted = "_".join(["rk", "live", "zzz"])
        self.assertTrue(self.b(f"STRIPE_KEY={live} node x.js"))
        self.assertTrue(self.b(f"echo {restricted}"))

    def test_plain_commands_allowed(self):
        for c in ["ls -la", "npm ci", "git status", "git commit -m 'main page tweak'",
                  "grep -r main src/", "git checkout -b claude/main-nav"]:
            self.assertFalse(self.b(c), c)


class Activation(unittest.TestCase):
    def test_main_exits_0_when_not_remote(self):
        import subprocess, json, sys
        path = os.path.join(os.path.dirname(__file__), "cloud-guard.py")
        payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": "git push origin main"}})
        env = {k: v for k, v in os.environ.items() if k != "CLAUDE_CODE_REMOTE"}
        r = subprocess.run([sys.executable, path], input=payload, text=True, capture_output=True, env=env)
        self.assertEqual(r.returncode, 0)
        env["CLAUDE_CODE_REMOTE"] = "true"
        r = subprocess.run([sys.executable, path], input=payload, text=True, capture_output=True, env=env)
        self.assertEqual(r.returncode, 2)
        self.assertIn("BLOCKED", r.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=1)

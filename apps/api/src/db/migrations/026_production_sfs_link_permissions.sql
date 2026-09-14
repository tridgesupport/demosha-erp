-- Migration 026: grant the new Production sub-nav links (SFS, ZFS, ZnO, Zinc
-- Dust) to any role that already has the 'production' tab.
--
-- app.ts's one-time role_link_permissions backfill only runs when that table
-- is empty, so it won't pick up links added after a role already has
-- granular permissions configured — this does the same grant, additively,
-- for just the new links (ON CONFLICT DO NOTHING: never touches an existing
-- row, so a role an admin already narrowed stays narrowed).
INSERT INTO role_link_permissions (role, tab, link_path)
SELECT role, 'production', link_path
FROM role_tab_permissions
CROSS JOIN (VALUES
  ('/production/sfs'),
  ('/production/zfs'),
  ('/production/zno'),
  ('/production/zinc-dust')
) AS new_links(link_path)
WHERE role_tab_permissions.tab = 'production'
ON CONFLICT DO NOTHING;

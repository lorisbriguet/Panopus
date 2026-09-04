use rusqlite::Connection;

/// Task 13: migration v2 seeds the designer wiki. V1 creates the empty
/// designers/designer_sources tables; V2 must fill them with the 10
/// researched designers/foundries and their source mappings.
#[test]
fn migration_v2_seeds_ten_designers() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(panopus_lib::MIGRATION_V1).unwrap();
    conn.execute_batch(panopus_lib::MIGRATION_V2).unwrap();

    let n: i64 = conn
        .query_row("SELECT count(*) FROM designers", [], |r| r.get(0))
        .unwrap();
    assert_eq!(n, 10);

    // Steffmann's wiki entry must claim the 'steffmann' font source
    let mapped: i64 = conn
        .query_row(
            "SELECT count(*) FROM designer_sources ds \
             JOIN designers d ON d.id = ds.designer_id \
             WHERE d.slug = 'steffmann' AND ds.source = 'steffmann'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(mapped, 1);
}

/// Every seeded bio must be a valid Tiptap document: JSON that parses and
/// carries a top-level {"type": "doc"} — otherwise the wiki editor cannot
/// load it.
#[test]
fn migration_v2_bios_are_valid_tiptap_docs() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(panopus_lib::MIGRATION_V1).unwrap();
    conn.execute_batch(panopus_lib::MIGRATION_V2).unwrap();

    let mut stmt = conn
        .prepare("SELECT slug, content_json, links FROM designers")
        .unwrap();
    let rows: Vec<(String, String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    assert_eq!(rows.len(), 10);

    for (slug, content_json, links) in rows {
        let doc: serde_json::Value = serde_json::from_str(&content_json)
            .unwrap_or_else(|e| panic!("{slug}: content_json is not JSON: {e}"));
        assert_eq!(
            doc.get("type").and_then(|t| t.as_str()),
            Some("doc"),
            "{slug}: content_json must be a Tiptap doc"
        );
        let paragraphs = doc
            .get("content")
            .and_then(|c| c.as_array())
            .unwrap_or_else(|| panic!("{slug}: doc has no content array"));
        assert!(
            (2..=4).contains(&paragraphs.len()),
            "{slug}: expected 2-4 paragraphs, got {}",
            paragraphs.len()
        );

        let links: serde_json::Value = serde_json::from_str(&links)
            .unwrap_or_else(|e| panic!("{slug}: links is not JSON: {e}"));
        let urls = links
            .as_array()
            .unwrap_or_else(|| panic!("{slug}: links must be a JSON array"));
        assert!(
            (2..=4).contains(&urls.len()),
            "{slug}: expected 2-4 links, got {}",
            urls.len()
        );
        for url in urls {
            let u = url.as_str().unwrap_or_else(|| panic!("{slug}: non-string link"));
            assert!(
                u.starts_with("http://") || u.starts_with("https://"),
                "{slug}: link is not a URL: {u}"
            );
        }
    }
}

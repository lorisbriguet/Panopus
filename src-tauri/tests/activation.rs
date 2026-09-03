//! DB-side tests for the CoreText activation module. Live CoreText
//! registration is not testable headlessly; these cover the truthful-state
//! DB logic only.

#[test]
fn db_only_marks_confirmed_activations() {
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    conn.execute_batch(panopus_lib::MIGRATION_V1).unwrap();
    conn.execute(
        "INSERT INTO fonts (id,path,family,source,format,hash) VALUES
      (1,'/a.ttf','A','opti','ttf','h1'),(2,'/b.ttf','B','opti','ttf','h2')",
        [],
    )
    .unwrap();
    let results = vec![(1i64, Ok(())), (2i64, Err("CoreText refused".to_string()))];
    panopus_lib::activation::set_active_in_db(&conn, &results, true).unwrap();
    let active: Vec<i64> = conn
        .prepare("SELECT id FROM fonts WHERE active=1")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .map(|x| x.unwrap())
        .collect();
    assert_eq!(active, vec![1]);
}

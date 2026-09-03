use rusqlite::Connection;

#[test]
fn migration_v1_creates_schema() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(panopus_lib::MIGRATION_V1).unwrap();
    let n: i64 = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN \
         ('fonts','tags','font_tags','sources','designers','designer_sources','settings')",
        [], |r| r.get(0)).unwrap();
    assert_eq!(n, 7);
    conn.execute("INSERT INTO fonts (path,family,style,ps_name,source,format,glyph_count,hash,is_system) \
                  VALUES ('/x.ttf','X','Regular','X-Reg','opti','otf',220,'abc',0)", []).unwrap();
}

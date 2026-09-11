use rusqlite::Connection;
fn main() -> anyhow::Result<()> {
    let conn = Connection::open("../content/content.db")?;
    let expected_q = [1,2,3,4,6,7,8,9,10,11,12,14,16,17,18,19,21,22,23,24,25,26,27,28,29,31,33,34,35,37,38,39,41,45,49,53,57,59,63,67,70,73,76,79,82,84,85,86,87,88,89,92,94,96,98,99];
    println!("expected count: {}", expected_q.len());
    let mut stmt = conn.prepare("SELECT ws.heading FROM doctrine_topics dt JOIN westminster_sections ws ON ws.id = dt.westminster_section_id JOIN westminster_documents wd ON wd.id = ws.document_id WHERE wd.code='wsc'")?;
    let headings: Vec<String> = stmt.query_map([], |r| r.get::<_,String>(0))?.collect::<Result<_,_>>()?;
    for q in expected_q {
        let h = format!("Question {q}");
        if !headings.contains(&h) {
            println!("MISSING Q{q}");
        }
    }
    Ok(())
}

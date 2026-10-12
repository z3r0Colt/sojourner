use rusqlite::{params, Connection, OptionalExtension};

/// A topic anchored to a specific paragraph in the Standards, either a WCF
/// chapter (via its first section) or one exact WSC question.
struct TopicSpec {
    name: &'static str,
    category: &'static str,
    anchor: Anchor,
}

enum Anchor {
    /// A WCF chapter number -- resolves to that chapter's first section
    /// ("Chapter N, 1", the format `westminster::import` writes).
    WcfChapter(i64),
    /// A WSC question number -- resolves to "Question N".
    WscQuestion(i64),
}

const SCRIPTURE: &str = "Scripture & the Knowledge of God";
const GOD: &str = "God, the Trinity & His Decrees";
const CREATION: &str = "Creation & Providence";
const FALL: &str = "The Fall, Sin & the Covenant";
const CHRIST: &str = "Christ the Mediator";
const APPLICATION: &str = "The Application of Salvation";
const LAW: &str = "The Law & the Christian Life";
const CHURCH: &str = "The Church & the Means of Grace";
const ORDER: &str = "Church Order & Prayer";
const LAST_THINGS: &str = "Last Things";

/// The 33 traditional chapter titles of the 1647 Westminster Confession of
/// Faith, in chapter order -- these are the Confession's own structure, not
/// a modern topical-Bible taxonomy. Public domain, unchanged across every
/// printing since 1647.
const WCF_TOPICS: &[TopicSpec] = &[
    TopicSpec { name: "Of the Holy Scripture", category: SCRIPTURE, anchor: Anchor::WcfChapter(1) },
    TopicSpec { name: "Of God, and of the Holy Trinity", category: GOD, anchor: Anchor::WcfChapter(2) },
    TopicSpec { name: "Of God's Eternal Decree", category: GOD, anchor: Anchor::WcfChapter(3) },
    TopicSpec { name: "Of Creation", category: CREATION, anchor: Anchor::WcfChapter(4) },
    TopicSpec { name: "Of Providence", category: CREATION, anchor: Anchor::WcfChapter(5) },
    TopicSpec { name: "Of the Fall of Man, of Sin, and of the Punishment thereof", category: FALL, anchor: Anchor::WcfChapter(6) },
    TopicSpec { name: "Of God's Covenant with Man", category: FALL, anchor: Anchor::WcfChapter(7) },
    TopicSpec { name: "Of Christ the Mediator", category: CHRIST, anchor: Anchor::WcfChapter(8) },
    TopicSpec { name: "Of Free Will", category: APPLICATION, anchor: Anchor::WcfChapter(9) },
    TopicSpec { name: "Of Effectual Calling", category: APPLICATION, anchor: Anchor::WcfChapter(10) },
    TopicSpec { name: "Of Justification", category: APPLICATION, anchor: Anchor::WcfChapter(11) },
    TopicSpec { name: "Of Adoption", category: APPLICATION, anchor: Anchor::WcfChapter(12) },
    TopicSpec { name: "Of Sanctification", category: APPLICATION, anchor: Anchor::WcfChapter(13) },
    TopicSpec { name: "Of Saving Faith", category: APPLICATION, anchor: Anchor::WcfChapter(14) },
    TopicSpec { name: "Of Repentance unto Life", category: APPLICATION, anchor: Anchor::WcfChapter(15) },
    TopicSpec { name: "Of Good Works", category: APPLICATION, anchor: Anchor::WcfChapter(16) },
    TopicSpec { name: "Of the Perseverance of the Saints", category: APPLICATION, anchor: Anchor::WcfChapter(17) },
    TopicSpec { name: "Of the Assurance of Grace and Salvation", category: APPLICATION, anchor: Anchor::WcfChapter(18) },
    TopicSpec { name: "Of the Law of God", category: LAW, anchor: Anchor::WcfChapter(19) },
    TopicSpec { name: "Of Christian Liberty, and Liberty of Conscience", category: LAW, anchor: Anchor::WcfChapter(20) },
    TopicSpec { name: "Of Religious Worship, and the Sabbath Day", category: LAW, anchor: Anchor::WcfChapter(21) },
    TopicSpec { name: "Of Lawful Oaths and Vows", category: LAW, anchor: Anchor::WcfChapter(22) },
    TopicSpec { name: "Of the Civil Magistrate", category: LAW, anchor: Anchor::WcfChapter(23) },
    TopicSpec { name: "Of Marriage and Divorce", category: LAW, anchor: Anchor::WcfChapter(24) },
    TopicSpec { name: "Of the Church", category: CHURCH, anchor: Anchor::WcfChapter(25) },
    TopicSpec { name: "Of the Communion of Saints", category: CHURCH, anchor: Anchor::WcfChapter(26) },
    TopicSpec { name: "Of the Sacraments", category: CHURCH, anchor: Anchor::WcfChapter(27) },
    TopicSpec { name: "Of Baptism", category: CHURCH, anchor: Anchor::WcfChapter(28) },
    TopicSpec { name: "Of the Lord's Supper", category: CHURCH, anchor: Anchor::WcfChapter(29) },
    TopicSpec { name: "Of Church Censures", category: ORDER, anchor: Anchor::WcfChapter(30) },
    TopicSpec { name: "Of Synods and Councils", category: ORDER, anchor: Anchor::WcfChapter(31) },
    TopicSpec { name: "Of the State of Men after Death, and of the Resurrection of the Dead", category: LAST_THINGS, anchor: Anchor::WcfChapter(32) },
    TopicSpec { name: "Of the Last Judgment", category: LAST_THINGS, anchor: Anchor::WcfChapter(33) },
];

/// A curated set of Westminster Shorter Catechism questions covering
/// doctrines at a grain the WCF chapter list alone doesn't surface --
/// each of the Ten Commandments individually, the specific offices of
/// Christ, the particular means of grace, and so on. Deliberately skips
/// the WSC's many near-duplicate "what is required/forbidden in the Nth
/// commandment" pairs (Qs 46-48, 50-52, ...) in favor of one anchor per
/// commandment (its "which is the Nth commandment" question) -- opening
/// that topic surfaces the full cluster of related questions through the
/// ordinary Confession browsing UI, so they don't also need to be
/// separate topics in a browsable list. Question numbers verified against
/// reference/westminster/shorter_catechism.json.
const WSC_TOPICS: &[TopicSpec] = &[
    TopicSpec { name: "The Chief End of Man", category: SCRIPTURE, anchor: Anchor::WscQuestion(1) },
    TopicSpec { name: "The Rule of Faith and Life", category: SCRIPTURE, anchor: Anchor::WscQuestion(2) },
    TopicSpec { name: "What Scripture Principally Teaches", category: SCRIPTURE, anchor: Anchor::WscQuestion(3) },
    TopicSpec { name: "The Nature of God", category: GOD, anchor: Anchor::WscQuestion(4) },
    TopicSpec { name: "The Trinity", category: GOD, anchor: Anchor::WscQuestion(6) },
    TopicSpec { name: "The Decrees of God", category: GOD, anchor: Anchor::WscQuestion(7) },
    TopicSpec { name: "How God Executes His Decrees", category: GOD, anchor: Anchor::WscQuestion(8) },
    TopicSpec { name: "The Work of Creation", category: CREATION, anchor: Anchor::WscQuestion(9) },
    TopicSpec { name: "The Creation of Man", category: CREATION, anchor: Anchor::WscQuestion(10) },
    TopicSpec { name: "The Works of Providence", category: CREATION, anchor: Anchor::WscQuestion(11) },
    TopicSpec { name: "The Covenant of Life", category: FALL, anchor: Anchor::WscQuestion(12) },
    TopicSpec { name: "The Nature of Sin", category: FALL, anchor: Anchor::WscQuestion(14) },
    TopicSpec { name: "Original Sin", category: FALL, anchor: Anchor::WscQuestion(16) },
    TopicSpec { name: "The Fall of Man", category: FALL, anchor: Anchor::WscQuestion(17) },
    TopicSpec { name: "The Sinfulness of Man's Fallen State", category: FALL, anchor: Anchor::WscQuestion(18) },
    TopicSpec { name: "The Misery of Man's Fallen State", category: FALL, anchor: Anchor::WscQuestion(19) },
    TopicSpec { name: "Christ the Redeemer", category: CHRIST, anchor: Anchor::WscQuestion(21) },
    TopicSpec { name: "The Incarnation", category: CHRIST, anchor: Anchor::WscQuestion(22) },
    TopicSpec { name: "The Offices of Christ", category: CHRIST, anchor: Anchor::WscQuestion(23) },
    TopicSpec { name: "Christ's Prophetic Office", category: CHRIST, anchor: Anchor::WscQuestion(24) },
    TopicSpec { name: "Christ's Priestly Office", category: CHRIST, anchor: Anchor::WscQuestion(25) },
    TopicSpec { name: "Christ's Kingly Office", category: CHRIST, anchor: Anchor::WscQuestion(26) },
    TopicSpec { name: "Christ's Humiliation", category: CHRIST, anchor: Anchor::WscQuestion(27) },
    TopicSpec { name: "Christ's Exaltation", category: CHRIST, anchor: Anchor::WscQuestion(28) },
    TopicSpec { name: "Our Partaking of Redemption", category: APPLICATION, anchor: Anchor::WscQuestion(29) },
    TopicSpec { name: "Effectual Calling", category: APPLICATION, anchor: Anchor::WscQuestion(31) },
    TopicSpec { name: "Justification", category: APPLICATION, anchor: Anchor::WscQuestion(33) },
    TopicSpec { name: "Adoption", category: APPLICATION, anchor: Anchor::WscQuestion(34) },
    TopicSpec { name: "Sanctification", category: APPLICATION, anchor: Anchor::WscQuestion(35) },
    TopicSpec { name: "Benefits at Death", category: APPLICATION, anchor: Anchor::WscQuestion(37) },
    TopicSpec { name: "The Resurrection", category: APPLICATION, anchor: Anchor::WscQuestion(38) },
    TopicSpec { name: "The Duty God Requires of Man", category: LAW, anchor: Anchor::WscQuestion(39) },
    TopicSpec { name: "The Moral Law Summarized", category: LAW, anchor: Anchor::WscQuestion(41) },
    TopicSpec { name: "The First Commandment", category: LAW, anchor: Anchor::WscQuestion(45) },
    TopicSpec { name: "The Second Commandment", category: LAW, anchor: Anchor::WscQuestion(49) },
    TopicSpec { name: "The Third Commandment", category: LAW, anchor: Anchor::WscQuestion(53) },
    TopicSpec { name: "The Fourth Commandment", category: LAW, anchor: Anchor::WscQuestion(57) },
    TopicSpec { name: "The Sabbath Day", category: LAW, anchor: Anchor::WscQuestion(59) },
    TopicSpec { name: "The Fifth Commandment", category: LAW, anchor: Anchor::WscQuestion(63) },
    TopicSpec { name: "The Sixth Commandment", category: LAW, anchor: Anchor::WscQuestion(67) },
    TopicSpec { name: "The Seventh Commandment", category: LAW, anchor: Anchor::WscQuestion(70) },
    TopicSpec { name: "The Eighth Commandment", category: LAW, anchor: Anchor::WscQuestion(73) },
    TopicSpec { name: "The Ninth Commandment", category: LAW, anchor: Anchor::WscQuestion(76) },
    TopicSpec { name: "The Tenth Commandment", category: LAW, anchor: Anchor::WscQuestion(79) },
    TopicSpec { name: "Man's Inability to Keep the Law", category: LAW, anchor: Anchor::WscQuestion(82) },
    TopicSpec { name: "The Wages of Sin", category: LAW, anchor: Anchor::WscQuestion(84) },
    TopicSpec { name: "Escaping God's Wrath and Curse", category: CHURCH, anchor: Anchor::WscQuestion(85) },
    TopicSpec { name: "Faith in Jesus Christ", category: CHURCH, anchor: Anchor::WscQuestion(86) },
    TopicSpec { name: "Repentance unto Life", category: CHURCH, anchor: Anchor::WscQuestion(87) },
    TopicSpec { name: "The Outward Means of Grace", category: CHURCH, anchor: Anchor::WscQuestion(88) },
    TopicSpec { name: "The Word as a Means of Grace", category: CHURCH, anchor: Anchor::WscQuestion(89) },
    TopicSpec { name: "The Sacraments", category: CHURCH, anchor: Anchor::WscQuestion(92) },
    TopicSpec { name: "Baptism", category: CHURCH, anchor: Anchor::WscQuestion(94) },
    TopicSpec { name: "The Lord's Supper", category: CHURCH, anchor: Anchor::WscQuestion(96) },
    TopicSpec { name: "Prayer", category: ORDER, anchor: Anchor::WscQuestion(98) },
    TopicSpec { name: "The Rule for Prayer", category: ORDER, anchor: Anchor::WscQuestion(99) },
];

fn resolve(conn: &Connection, wcf_document_id: i64, wsc_document_id: i64, anchor: &Anchor) -> anyhow::Result<Option<i64>> {
    let (document_id, heading) = match anchor {
        Anchor::WcfChapter(n) => (wcf_document_id, format!("Chapter {n}, 1")),
        Anchor::WscQuestion(n) => (wsc_document_id, format!("Question {n}")),
    };
    Ok(conn
        .query_row(
            "SELECT id FROM westminster_sections WHERE document_id = ?1 AND heading = ?2",
            params![document_id, heading],
            |r| r.get(0),
        )
        .optional()?)
}

/// Seeds `doctrine_topics` from the curated lists above. Must run after the
/// Westminster Standards import, which is what actually creates the rows
/// these topics anchor to.
pub fn import(conn: &Connection) -> anyhow::Result<usize> {
    let wcf_document_id: Option<i64> =
        conn.query_row("SELECT id FROM westminster_documents WHERE code = 'wcf'", [], |r| r.get(0)).optional()?;
    let wsc_document_id: Option<i64> =
        conn.query_row("SELECT id FROM westminster_documents WHERE code = 'wsc'", [], |r| r.get(0)).optional()?;
    let (Some(wcf_document_id), Some(wsc_document_id)) = (wcf_document_id, wsc_document_id) else {
        return Ok(0);
    };

    let mut count = 0i64;
    for spec in WCF_TOPICS.iter().chain(WSC_TOPICS.iter()) {
        let Some(section_id) = resolve(conn, wcf_document_id, wsc_document_id, &spec.anchor)? else {
            continue;
        };
        conn.execute(
            "INSERT INTO doctrine_topics (name, category, sort_order, westminster_section_id) VALUES (?1, ?2, ?3, ?4)",
            params![spec.name, spec.category, count, section_id],
        )?;
        count += 1;
    }
    Ok(count as usize)
}

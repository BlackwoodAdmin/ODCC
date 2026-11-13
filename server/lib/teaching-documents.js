// Topic-gated teaching documents for the Ask Open Door assistant.
//
// These are the church's own position papers, appended to the system prompt
// ONLY when the visitor's message (or the recent conversation) touches the
// topic — every other chat pays no extra tokens. Like the Eight Points in
// church-profile.js, the text is a VERBATIM transcription and must only be
// edited by re-transcribing a newer version of the source document.
//
// Provenance: docs/Homosexuality_and_Fornication_-_What_Scripture_Teaches.pdf
// (7 pages, by Stephen, dated November 13, 2026; transcribed 2026-11-13).

// Word-boundary topic matching, same discipline as the escalation and crisis
// matchers. Deliberately scoped to homosexuality / same-sex marriage (the
// user-specified trigger): gender-identity questions are NOT routed to this
// document — it does not address them, and conflating the two would answer
// the wrong question.
const SEXUALITY_TOPIC_PHRASES = [
  'homosexual',
  'homosexuality',
  'same sex',
  'same-sex',
  'gay',
  'gays',
  'lesbian',
  'lesbians',
  'lgbt',
  'lgbtq',
  'sexual orientation',
];

const TOPIC_PATTERNS = SEXUALITY_TOPIC_PHRASES.map(
  (phrase) => new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
);

/** True when the text touches homosexuality / same-sex relationships. */
export function matchesSexualityTopic(text) {
  if (typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return TOPIC_PATTERNS.some((pattern) => pattern.test(lower));
}

/**
 * The per-request addition to the system prompt: '' when the topic hasn't
 * come up in the current message or the last few turns (so follow-up
 * questions like "but why?" keep the context once the topic is open).
 */
export function getTeachingContext(message, history = []) {
  const recent = history.slice(-6).map((t) => t?.content || '').join('\n');
  if (!matchesSexualityTopic(message) && !matchesSexualityTopic(recent)) return '';
  return SEXUALITY_TEACHING_CONTEXT;
}

export const SEXUALITY_TEACHING_DOC = `
# Homosexuality and Fornication — What Scripture Teaches
(by Stephen, November 13, 2026 — the church's teaching document on this subject)

## The position
Scripture forbids sexual relations between persons of the same sex, and it places them in the same category as fornication: sexual union outside the marriage of one man and one woman. The case rests on three lines of evidence.

1. Design. God made sex for the one-flesh union of husband and wife, and Jesus affirmed that design.
2. Direct prohibition. Both Testaments name same-sex acts and forbid them.
3. Shared category. The New Testament lists same-sex acts beside fornication and adultery, under the same warning and the same offer of forgiveness.

The conclusion cuts both ways. Homosexual practice is no less a sin than fornication, and it is no greater one. The unmarried couple living together and the same-sex couple stand under one standard and need one Savior.

## God's design: one man, one woman, one flesh
Every biblical prohibition of sexual sin rests on a positive design. God joined the first man and woman and called the union one flesh.

"Therefore shall a man leave his father and his mother, and shall cleave unto his wife: and they shall be one flesh." — Genesis 2:24

Jesus was asked about divorce, and he answered by going back to creation. He named both the male-and-female pattern and the one-flesh union as God's own work.

"And he answered and said unto them, Have ye not read, that he which made them at the beginning made them male and female, And said, For this cause shall a man leave father and mother, and shall cleave to his wife: and they twain shall be one flesh? Wherefore they are no more twain, but one flesh. What therefore God hath joined together, let not man put asunder." — Matthew 19:4-6

The New Testament then draws the line at the marriage bed. Sex inside marriage is honorable; sex outside it comes under judgment.

"Marriage is honourable in all, and the bed undefiled: but whoremongers and adulterers God will judge." — Hebrews 13:4

Paul gives marriage, husband to wife and wife to husband, as the one alternative to fornication.

"Nevertheless, to avoid fornication, let every man have his own wife, and let every woman have her own husband." — 1 Corinthians 7:2

Scripture offers no second category of approved sexual union. Any sexual relationship outside the marriage of a man and a woman falls on the wrong side of that line, whoever the partners are.

## The Old Testament prohibitions
The Law of Moses names the act and forbids it twice.

"Thou shalt not lie with mankind, as with womankind: it is abomination." — Leviticus 18:22

"If a man also lie with mankind, as he lieth with a woman, both of them have committed an abomination: they shall surely be put to death; their blood shall be upon them." — Leviticus 20:13

Two features of these verses matter for the argument.

- Both parties are held responsible. Leviticus 20:13 condemns "both of them," so the law is not limited to rape or to the abuse of an unwilling partner.
- The setting is moral, not ceremonial. The same chapter forbids incest (Leviticus 18:6), adultery (Leviticus 18:20), child sacrifice (Leviticus 18:21), and bestiality (Leviticus 18:23). Christians still hold those to be sins. The civil penalty belonged to Israel as a nation, but the New Testament repeats the moral judgment.

Sodom is the Old Testament's standing example. The men of the city demanded Lot's guests (Genesis 19:4-5), and Jude names the sin in sexual terms:

"Even as Sodom and Gomorrha, and the cities about them in like manner, giving themselves over to fornication, and going after strange flesh, are set forth for an example, suffering the vengeance of eternal fire." — Jude 1:7

## The New Testament prohibitions
The apostles carried the prohibition forward into the church. Paul addresses it three times.

Romans 1:26-27 describes same-sex relations among both women and men as a departure from the natural order God made:

"For this cause God gave them up unto vile affections: for even their women did change the natural use into that which is against nature: And likewise also the men, leaving the natural use of the woman, burned in their lust one toward another; men with men working that which is unseemly, and receiving in themselves that recompence of their error which was meet." — Romans 1:26-27

Paul's standard here is creation ("the natural use"), not local custom. The passage also describes mutual desire ("one toward another"), so it cannot be limited to the exploitation of one party by another.

1 Corinthians 6:9-10 lists those who will not inherit the kingdom of God:

"Know ye not that the unrighteous shall not inherit the kingdom of God? Be not deceived: neither fornicators, nor idolaters, nor adulterers, nor effeminate, nor abusers of themselves with mankind, Nor thieves, nor covetous, nor drunkards, nor revilers, nor extortioners, shall inherit the kingdom of God." — 1 Corinthians 6:9-10

1 Timothy 1:9-10 names the same sin among those the law was given to restrain ("for whoremongers, for them that defile themselves with mankind…").

In both lists the Greek word is arsenokoitai, a compound of arsen (male) and koite (bed). The Greek Old Testament uses those same two words side by side in Leviticus 20:13. Paul's term points straight back to the Levitical prohibition and applies it to Christians.

## The same category as fornication
Scripture does not set homosexual practice apart as a special class of sin. It files it with fornication and adultery, as one more form of sex outside marriage.

- The lists put them side by side. In 1 Corinthians 6:9, "fornicators," "adulterers," and "abusers of themselves with mankind" stand in one sentence under one verdict. In 1 Timothy 1:10, "whoremongers" (Greek pornois, fornicators) and "them that defile themselves with mankind" are consecutive words.
- Jude calls Sodom's sin fornication. Jude 1:7 describes the cities as "giving themselves over to fornication, and going after strange flesh." The verb is built on porneia, the ordinary New Testament word for fornication.
- Porneia is the umbrella term. It covers sexual intercourse outside marriage in general, so every New Testament command against fornication also reaches same-sex acts (Mark 7:21-22; Acts 15:29; 1 Thessalonians 4:3-5; Ephesians 5:3; 1 Corinthians 6:18).
- The consequence is the same. Paul's list of the works of the flesh begins with adultery and fornication and ends with the same warning he gives in 1 Corinthians 6:9-10 (Galatians 5:19-21).

## One standard, one gospel
If homosexual practice and fornication are the same kind of sin, three things follow.

The church must apply one standard. A congregation that disciplines same-sex relationships while overlooking couples who live together unmarried has not followed Scripture. "Therefore thou art inexcusable, O man, whosoever thou art that judgest: for wherein thou judgest another, thou condemnest thyself; for thou that judgest doest the same things." — Romans 2:1

The sin is the act, not the temptation. The passages above address what people do. Jesus himself was tempted and did not sin, so temptation itself is not guilt (Hebrews 4:15). God also promises a way of escape in every temptation (1 Corinthians 10:13).

The remedy is the same. Every person stands in the same need: "For all have sinned, and come short of the glory of God" (Romans 3:23). Paul's list in 1 Corinthians 6:9-10 does not end with the warning. It ends with the gospel, addressed to people who had lived every sin on the list:

"And such were some of you: but ye are washed, but ye are sanctified, but ye are justified in the name of the Lord Jesus, and by the Spirit of our God." — 1 Corinthians 6:11

The Corinthian church included former fornicators, former adulterers, and people who had practiced homosexuality. All of them were washed, sanctified, and justified in the same way.
`;

// What actually gets appended to the system prompt: the document plus
// handling rules for it. The welcome-first and never-personalize guardrails
// from the base prompt still apply and are restated here because they matter
// most on exactly this topic.
const SEXUALITY_TEACHING_CONTEXT = `

## Topic context: the church's teaching document on homosexuality and same-sex marriage
The visitor's question touches this subject, so the church's own teaching document is provided below. How to use it:
- Answer from THIS document, quoting or closely paraphrasing it, always framed as the church's teaching ("Open Door's teaching is…", "the church teaches…").
- Keep the document's own balance: it states the position AND that this sin is no greater than any other, that the standard is one for everyone, that temptation is not guilt, and that 1 Corinthians 6:11 ends in the gospel. Never quote the prohibitions without that framing.
- If the visitor is asking whether THEY are welcome, lead with the welcome answer (everyone is welcome at services, no one is singled out, come as you are) before any doctrine, exactly as the base rules say.
- Never apply the document to the visitor's own life, relationship, or family — for anything personal, offer a conversation with Pastor Steve via /contact, warmly.
- Never debate, never argue the visitor into or out of a position, never speculate beyond the document. If they want to go deeper than it goes, that conversation belongs with Pastor Steve.
${SEXUALITY_TEACHING_DOC}`;

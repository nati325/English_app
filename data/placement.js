// מבחן רמה התחלתי. רמות: 0=Pre-A1 1=A1 2=A2 3=B1 4=B2 5=C1 6=C2
export const LEVELS = ['Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// הערכה עצמית – קובעת רק את נקודת ההתחלה, לא את התוצאה
export const SELF = [
  ['כמעט לא יודע אנגלית', 0], ['מבין מילים ומשפטים פשוטים', 1],
  ['מסתדר בשיחה בסיסית', 2], ['מדבר די בחופשיות, עם טעויות', 3], ['מדבר שוטף, רוצה להישמע כמו native', 4]
];

// אוצר מילים מעבר ל-3,500: "מכיר / לא מכיר" (שיטת Yes/No עם מילים מומצאות לתיקון ניחושים).
// טווחי דירוג לפי שכיחות בשפה מדוברת (רשימת כתוביות). רוחב הטווח משמש לחישוב היקף אוצר המילים.
export const YESNO = [
  { from: 3500, to: 5000, words: 'softly deeper dancer liver fighter safely locker nicely awfully differently currently shortly closely fairly hunger drawer'.split(' ') },
  { from: 5000, to: 8000, words: 'confusion dreadful tasty chemistry companion lottery eager gratitude compromise essential opponent curiosity forehead bracelet arrogant withdraw'.split(' ') },
  { from: 8000, to: 12000, words: 'heritage preliminary discretion prophecy machinery scholar handkerchief beacon predator syrup banquet altitude breakthrough considerable vague inherit'.split(' ') },
  { from: 12000, to: 16000, words: 'stealth cramp ghastly penance moist gauge pilgrimage render vulture refrain fatigue humility resentment forfeit indifferent covenant'.split(' ') }
];
// מילים מומצאות (לא קיימות באנגלית) – מי שמסמן "מכיר" עליהן מנחש
export const PSEUDO = 'plorrent dacklen brastle mundle grenty flottish sparrage cronnel thribble vasper glomber nustain preckle trundance mertish quandle ferrow lorrish sheddock clendish'.split(' ');

// דקדוק: [רמה, שאלה, אפשרויות, אינדקס נכון, הסבר בעברית]. ממוקד בטעויות נפוצות של דוברי עברית.
export const GRAMMAR = [
  [1, 'She ___ a teacher.', ['is', 'are', 'am', 'be'], 0, 'עם he/she/it משתמשים ב-is.'],
  [1, 'I have ___ apple.', ['a', 'an', 'the', '—'], 1, 'לפני מילה שמתחילה בתנועה: an.'],
  [1, '___ you like coffee?', ['Do', 'Does', 'Are', 'Is'], 0, 'שאלה בהווה פשוט עם you: Do.'],
  [1, 'They ___ in Haifa.', ['live', 'lives', 'living', 'is live'], 0, 'עם they אין s בפועל.'],
  [2, 'Yesterday I ___ to the beach.', ['go', 'went', 'gone', 'was go'], 1, 'עבר פשוט של go הוא went.'],
  [2, 'He ___ TV right now.', ['watches', 'is watching', 'watch', 'watched'], 1, 'פעולה שקורית עכשיו: is + ing.'],
  [2, 'This is the ___ movie I have ever seen.', ['best', 'better', 'most good', 'good'], 0, 'הדרגה העליונה של good היא best.'],
  [2, 'We arrived ___ the airport at six.', ['at', 'in', 'to', 'on'], 0, 'arrive at למקום מסוים (לא arrive to).'],
  [3, 'I ___ here since 2020.', ['live', 'lived', 'have lived', 'am living'], 2, 'מ-2020 ועד עכשיו: present perfect. בעברית אומרים "אני גר", באנגלית I have lived.'],
  [3, 'If it rains tomorrow, we ___ at home.', ['stay', 'will stay', 'would stay', 'stayed'], 1, 'תנאי אמיתי לעתיד: If + הווה, will + פועל.'],
  [3, 'Can you tell me how much ___?', ['it costs', 'does it cost', 'it does cost', 'cost it'], 0, 'שאלה עקיפה: סדר מילים של משפט רגיל, בלי does.'],
  [3, "There aren't ___ eggs left.", ['much', 'many', 'a lot', 'some'], 1, 'דברים שאפשר לספור: many.'],
  [4, 'If I ___ you, I would take the job.', ['am', 'was', 'were', 'be'], 2, 'תנאי דמיוני: If I were you.'],
  [4, "I'm looking forward ___ you.", ['to see', 'to seeing', 'seeing', 'see'], 1, 'look forward to + ing (ה-to כאן היא מילת יחס).'],
  [4, 'She asked me where ___.', ['I live', 'do I live', 'I lived', 'did I live'], 2, 'דיבור עקיף: הזמן זז אחורה וסדר המילים רגיל.'],
  [4, 'The new bridge ___ next year.', ['will build', 'will be built', 'is building', 'builds'], 1, 'סביל (passive) בעתיד: will be + V3.'],
  [5, 'If I had known, I ___ you.', ['would tell', 'would have told', 'had told', 'will tell'], 1, 'תנאי בעבר: If + had V3, would have + V3.'],
  [5, 'Hardly ___ arrived when it started to rain.', ['we had', 'had we', 'we have', 'did we'], 1, 'אחרי Hardly בתחילת משפט – היפוך: had we.'],
  [5, "It's high time we ___ home.", ['go', 'went', 'will go', 'are going'], 1, 'It\'s high time + עבר פשוט.'],
  [5, "I'd rather you ___ smoke in here.", ["don't", "didn't", "won't", 'not'], 1, "I'd rather + you + עבר פשוט."]
];

// הבנת שמיעה: [רמה, טקסט להשמעה, מהירות, אפשרויות, אינדקס נכון]
export const LISTEN = [
  [1, 'I have two sisters.', .85, ['I have two sisters.', 'I had two sisters.', 'I have three sisters.'], 0],
  [1, 'Where is the bus station?', .85, ['Where was the bus station?', 'Where is the bus station?', 'Where is the train station?'], 1],
  [2, "She didn't come to work yesterday.", .95, ["She doesn't come to work today.", "She did come to work yesterday.", "She didn't come to work yesterday."], 2],
  [2, 'Can you call me after lunch?', .95, ['Can you call me after lunch?', 'Can you call me before lunch?', 'Could you tell me about lunch?'], 0],
  [3, "I've been waiting for almost an hour.", 1, ['I was waiting for about an hour.', "I've been waiting for almost an hour.", "I've been waiting for almost a year."], 1],
  [3, 'What are you going to do this weekend?', 1, ['What did you do last weekend?', 'What are you going to do this weekend?', 'What do you want to do this week?'], 1],
  [4, "If I'd known, I would've called you.", 1.05, ["If I know, I'll call you.", "If I knew, I would call you.", "If I'd known, I would've called you."], 2],
  [4, "She can't have left already.", 1.05, ["She can't have left already.", "She can leave already.", "She couldn't leave already."], 0],
  [5, "Had I realized how late it was, I'd have left earlier.", 1.1, ["I hadn't realized how late it was, so I left earlier.", "Had I realized how late it was, I'd have left earlier.", "Have I realized how late it is? I'll leave earlier."], 1],
  [5, "It's not like he didn't warn us.", 1.1, ["It's not that he warned us.", "He didn't like to warn us.", "It's not like he didn't warn us."], 2]
];

// אוזן: זוגות מינימליים קשים לדוברי עברית
export const EAR = [['ship', 'sheep', 'ɪ / i'], ['think', 'sink', 'θ / s'], ['very', 'berry', 'v / b'], ['walk', 'work', 'ɔ / ɝ'], ['cap', 'cup', 'æ / ʌ'], ['west', 'vest', 'w / v']];

// דיבור (אופציונלי): קריאה בקול
export const SPEAK = ['I think it is a really good idea.', 'The weather was terrible this weekend.'];

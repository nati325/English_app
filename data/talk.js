// תרחישי שיחה (בשלב F יוחלפו/יתווספו עם Claude API; כרגע מבוסס כללים)
export const SCENARIOS = [
  { id:'intro', title:'היכרות', icon:'🙋', qs:['Hi! I\'m so glad to meet you. What\'s your name?', 'Nice to meet you! Where are you from?', 'What do you do for a living?', 'What do you like to do in your free time?', 'Why are you learning English?'] },
  { id:'cafe', title:'בית קפה', icon:'☕', qs:['Hi there! Welcome in. What can I get you today?', 'Sure thing. Would you like that for here or to go?', 'Anything else? Maybe something sweet?', 'That\'ll be seven fifty. Cash or card?'] },
  { id:'weekend', title:'סוף שבוע', icon:'🎉', qs:['Hey! How was your weekend?', 'Sounds fun! Who did you go with?', 'What was the best part?', 'What are you planning for next weekend?'] },
  { id:'work', title:'עבודה', icon:'💼', qs:['Good morning! Did you have a chance to look at the project?', 'What do you think the biggest challenge will be?', 'When do you think we can finish?', 'Would you like to schedule a meeting for tomorrow?'] }
];
export const REACTS = ['Great answer!', 'Interesting! Tell me more.', 'Nice!', 'I see — that sounds fun!', 'Wow, cool!', 'Good job speaking English!', 'Love it!'];

// תיקונים לטעויות נפוצות של דוברי עברית: [regex, תיקון, הסבר]
export const FIXES = [
  [/\bi am agree\b/i, 'I agree', 'אומרים "I agree" – בלי am.'],
  [/\bmore better\b/i, 'better', '"better" כבר השוואתי – בלי more.'],
  [/\bi have (\d+) years?\b/i, 'I am $1 years old', 'גיל אומרים עם am: "I am 30 years old".'],
  [/\b(he|she|it) don'?t\b/i, '$1 doesn\'t', 'בגוף שלישי יחיד: doesn\'t.'],
  [/\bdidn'?t (went|saw|ate|came|took|got|made|had)\b/i, 'didn\'t + צורה בסיסית (go/see/eat…)', 'אחרי didn\'t הפועל חוזר לצורה הבסיסית.'],
  [/\bi am go\b/i, 'I am going / I go', 'am + going, או פשוט go.'],
  [/\bpeoples\b/i, 'people', '"people" כבר ברבים.'],
  [/\bgood in\b/i, 'good at', 'אומרים "good AT something".'],
  [/\bdepends? of\b/i, 'depends on', 'אומרים "depends ON".'],
  [/\bi am (?:very )?boring\b/i, 'I am bored', 'bored = משועמם; boring = משעמם.'],
  [/\bmake (?:a )?sport\b/i, 'do sports', 'עושים sports עם do (או play).'],
  [/\bi want that you\b/i, 'I want you to', 'אומרים "I want you to…".'],
  [/\bsince (\d+|a|two|three|four|five|six|seven|eight|nine|ten) (years?|months?|weeks?|days?)\b/i, 'for $1 $2', 'משך זמן → for; נקודת זמן → since.'],
  [/\blisten (him|her|me|them|us)\b/i, 'listen to $1', 'אומרים "listen TO".'],
  [/\bemphasis? (?:is|was) on the (?:1st|first)/i, null, null]
].filter(f => f[1]);

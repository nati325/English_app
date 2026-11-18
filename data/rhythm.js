// שלב D: מקצב, הטעמה, חיבורים ואינטונציה (General American)
// מילות פונקציה – בדרך כלל *לא* מוטעמות במשפט (נהגות בצורה חלשה). כל השאר (שמות, פעלים, תארים, תואר פועל, שלילה, שאלות) מוטעמות.
export const FUNCTION_WORDS = new Set(`a an the and or but nor so if of to for in on at by with from as into onto than that this these those
am is are was were be been being do does did have has had will would can could shall should may might must
i me my mine you your yours he him his she her hers it its we us our they them their
there here who whom whose which what when where why how very just also too not no
some any one all each both more most such own same`.split(/\s+/));

// נושאים לשיעורי חיבורים: [כותרת, אייקון, טיפ בעברית, פריטים: [כתוב, "נשמע כמו", תרגום/הערה]]
export const LESSONS = {
  link: { title: 'חיבורים בין מילים', icon: '🔗',
    tip: 'דוברי אנגלית לא מפסיקים בין מילים. עיצור בסוף מילה "נתפס" על התנועה שאחריה: turn it on ← "tur-ni-ton". בעברית מפרידים כל מילה – כאן הסוד.',
    items: [
      ['turn it on', 'tur-ni-ton', 'הדלק את זה'], ['pick it up', 'pi-ki-dup', 'תרים את זה'], ['an apple', 'a-napple', 'תפוח'],
      ['look at it', 'loo-ka-dit', 'תסתכל על זה'], ['come on in', 'co-mo-nin', 'היכנס'], ['I need it', 'I nee-dit', 'אני צריך את זה'],
      ['check it out', 'che-ki-dout', 'תבדוק את זה'], ['not at all', 'no-da-tall', 'בכלל לא'], ['pick up the phone', 'pi-kup the phone', 'תענה לטלפון'],
      ['what a day', 'wha-da day', 'איזה יום']] },
  flap: { title: 'T אמריקאית (flap)', icon: '🇺🇸',
    tip: 'באמריקאית, t ו-d בין שתי תנועות (כשההברה השנייה לא מוטעמת) הופכים ל"d" רך וקצר: water ← "wadder". זה אחד הסימנים הגדולים ביותר של אקסנט אמריקאי.',
    items: [
      ['water', 'wadder', 'מים'], ['better', 'bedder', 'יותר טוב'], ['city', 'siddy', 'עיר'], ['party', 'pardy', 'מסיבה'],
      ['little', 'liddle', 'קטן'], ['butter', 'budder', 'חמאה'], ['get it', 'ge-dit', 'קבל את זה'], ['what a', 'wha-da', 'איזה'],
      ['a lot of', 'a lodda', 'הרבה'], ['pretty', 'priddy', 'יפה']] },
  red: { title: 'צורות מקוצרות בדיבור', icon: '⚡',
    tip: 'בדיבור יומיומי מצמצמים. חשוב *להבין* אותן, וגם להשתמש בהן בשיחה לא רשמית – זה מה שנשמע "טבעי". (בכתיבה: לא.)',
    items: [
      ['going to', 'gonna', 'עומד ל'], ['want to', 'wanna', 'רוצה ל'], ['got to', 'gotta', 'חייב'], ['kind of', 'kinda', 'סוג של'],
      ['let me', 'lemme', 'תן לי'], ['give me', 'gimme', 'תן לי'], ['what do you', 'whaddaya', 'מה אתה'], ['I do not know', 'I dunno', 'לא יודע'],
      ['did you', 'didja', 'האם'], ['could have', 'coulda', 'יכולתי'], ['should have', 'shoulda', 'הייתי צריך'], ['a lot of', 'a lotta', 'הרבה']] },
  weak: { title: 'צורות חלשות (schwa)', icon: '🌫️',
    tip: 'מילות פונקציה כמעט תמיד נהגות חלש, עם ə. זה מה שיוצר את הקצב של אנגלית: רק מילות התוכן "בולטות". אם תגיד כל מילה במלואה – תישמע "רובוטי".',
    items: [
      ['to', '/tə/', 'I want to go → "I wanna gə"'], ['for', '/fɚ/', 'for a week → "fɚ a week"'], ['and', '/ən/', 'salt and pepper → "salt ən pepper"'],
      ['of', '/əv/', 'cup of tea → "cup əv tea"'], ['the', '/ðə/', 'the bank → "ðə bank"'], ['a', '/ə/', 'a cat → "ə cat"'],
      ['can', '/kən/', 'I can swim → "I kən swim"'], ['was', '/wəz/', 'it was late → "it wəz late"'], ['have', '/həv/', 'I have to go → "I həv to go"'],
      ['at', '/ət/', 'at home → "ət home"'], ['from', '/frəm/', 'from Tel Aviv → "frəm Tel Aviv"'], ['them', '/əm/', 'tell them → "tell əm"']] },
  intonation: { title: 'אינטונציה', icon: '📈',
    tip: 'המנגינה של המשפט משנה משמעות. בעברית רבות מהמנגינות דומות, אבל באנגלית ירידה בסוף היא ברירת המחדל לאמירות ולשאלות WH.',
    items: [
      ['I live in Boston. ↘', 'אמירה: יורד בסוף', 'I live in Boston.'], ['Where do you live? ↘', 'שאלת WH: יורד', 'Where do you live?'],
      ['Are you ready? ↗', 'שאלת כן/לא: עולה', 'Are you ready?'], ['Tea or coffee? ↗↘', 'בחירה: עולה על הראשון, יורד על האחרון', 'Tea or coffee?'],
      ['Apples, ↗ oranges, ↗ and bananas. ↘', 'רשימה: עולה, עולה, יורד', 'Apples, oranges, and bananas.'], ['Really? ↗', 'הפתעה: עולה', 'Really?'],
      ['It is nice, isn\'t it? ↘', 'tag שמבקש הסכמה: יורד', 'It is nice, isn\'t it?'], ['You are coming, aren\'t you? ↗', 'tag שבודק: עולה', 'You are coming, aren\'t you?']] }
};

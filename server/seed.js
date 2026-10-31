const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db, nextCounter } = require('./db');
const cfg = require('./config');

const PAGES = {
  about: ['मंच परिचय', `<h2>भारतीय मुस्लिम मंच</h2>
<p>भारतीय मुस्लिम मंच एक राष्ट्रीय मंच है जो भारतीय संविधान के दायरे में रहकर शिक्षा, इंसाफ़, रोज़गार, नागरिक अधिकारों और आपसी भाईचारे के लिए काम करता है।</p>
<p>मंच के संरक्षक <b>जनाब मोहम्मद अदीब</b> (पूर्व सांसद, राज्यसभा) हैं तथा राष्ट्रीय संयोजक <b>डॉ. मुमताज़ आलम रिज़वी</b> हैं।</p>
<h3>हमारा विश्वास</h3>
<ul><li>संविधान सर्वोपरि है — बराबरी, इज़्ज़त और इंसाफ़ हर नागरिक का हक़ है।</li><li>तालीम और रोज़गार से ही क़ौम और मुल्क की तरक़्क़ी मुमकिन है।</li><li>सर्वसमाज के साथ संवाद और भाईचारा हमारी ताक़त है।</li></ul>
<p><i>(यह पृष्ठ एडमिन पैनल → पेज में जाकर बदला जा सकता है।)</i></p>`],
  constitution: ['उद्देश्य एवं संविधान', `<h2>मंच के उद्देश्य</h2>
<ol><li>भारतीय संविधान के मूल्यों — न्याय, स्वतंत्रता, समता और बंधुत्व — की रक्षा और जन-जागरूकता।</li><li>शिक्षा, छात्रवृत्ति, कौशल विकास और रोज़गार के अवसरों तक युवाओं की पहुँच।</li><li>वक़्फ़ संपत्तियों की सुरक्षा और ज़रूरतमंदों को विधिक सहायता।</li><li>सांप्रदायिक सौहार्द, आपसी संवाद और अमन को बढ़ावा।</li><li>महिलाओं, वंचित व कमज़ोर वर्गों के सशक्तिकरण के लिए काम।</li></ol>
<p><i>(मंच का पंजीकृत संविधान/नियमावली यहाँ एडमिन पैनल से जोड़ें।)</i></p>`],
  privacy: ['गोपनीयता नीति', `<p>हम आपकी निजी जानकारी (नाम, मोबाइल, पता, फ़ोटो आदि) केवल सदस्यता, रसीद और मंच के संचार के उद्देश्य से एकत्र करते हैं। आपकी जानकारी बिना आपकी सहमति के किसी तीसरे पक्ष को नहीं बेची या साझा की जाएगी, सिवाय क़ानूनी आवश्यकता के।</p>
<p>ऑनलाइन भुगतान अधिकृत पेमेंट गेटवे के माध्यम से होते हैं; हम आपके कार्ड/UPI की संवेदनशील जानकारी अपने पास संग्रहीत नहीं करते।</p>
<p>जानकारी में सुधार या हटाने के लिए कृपया संपर्क पृष्ठ से हमें लिखें।</p>`],
  terms: ['नियम एवं शर्तें', `<p>इस वेबसाइट का उपयोग करके आप इन शर्तों से सहमत होते हैं। सदस्यता आवेदन की स्वीकृति मंच के विवेक पर है। सदस्यता कार्ड केवल पहचान और सदस्यता सत्यापन हेतु है और हस्तांतरणीय नहीं है।</p>
<p>दान/योगदान स्वैच्छिक हैं। दाता को भारत का नागरिक होना चाहिए और राशि वैध स्रोत से होनी चाहिए।</p>`],
  refund: ['रिफंड नीति', `<p>दान/योगदान स्वैच्छिक होते हैं और सामान्यतः वापस नहीं किए जाते। तकनीकी कारण से दोहरी कटौती या असफल भुगतान में कटी राशि पेमेंट गेटवे के नियमों के अनुसार 5–7 कार्य दिवस में वापस आ जाती है। सहायता के लिए संपर्क पृष्ठ से हमें लिखें।</p>`],
};

function run() {
  // first admin
  if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
    let pw = cfg.ADMIN_PASSWORD;
    const generated = !pw;
    if (generated) pw = crypto.randomBytes(9).toString('base64url');
    db.prepare(`INSERT INTO users(username,name,password_hash,role) VALUES(?,?,?,'super')`).run(cfg.ADMIN_USER.toLowerCase(), 'Administrator', bcrypt.hashSync(pw, 11));
    console.log('============================================================');
    console.log(` Admin created -> user: ${cfg.ADMIN_USER.toLowerCase()}  ${generated ? 'password: ' + pw + '   (change it after login!)' : '(password from ADMIN_PASSWORD)'}`);
    console.log('============================================================');
  }
  // Password reset: set ADMIN_RESET=1 together with ADMIN_PASSWORD, redeploy once, then remove ADMIN_RESET.
  if (process.env.ADMIN_RESET === '1' && cfg.ADMIN_PASSWORD) {
    const u = cfg.ADMIN_USER.toLowerCase(), h = bcrypt.hashSync(cfg.ADMIN_PASSWORD, 11);
    const r = db.prepare("UPDATE users SET password_hash=?, active=1, role='super' WHERE username=?").run(h, u);
    if (!r.changes) db.prepare("INSERT INTO users(username,name,password_hash,role) VALUES(?,?,?,'super')").run(u, 'Administrator', h);
    console.log(` Admin password RESET for user '${u}' from ADMIN_PASSWORD. Now remove ADMIN_RESET from env.`);
  }
  const insP = db.prepare('INSERT OR IGNORE INTO pages(slug,title,body) VALUES(?,?,?)');
  for (const [slug, [title, body]] of Object.entries(PAGES)) insP.run(slug, title, body);

  if (!db.prepare('SELECT 1 FROM leaders LIMIT 1').get()) {
    const ins = db.prepare('INSERT INTO leaders(name,name_en,title,title_en,bio,grp,sort,facebook) VALUES(?,?,?,?,?,?,?,?)');
    ins.run('जनाब मोहम्मद अदीब', 'Mohammad Adeeb', 'संरक्षक • पूर्व सांसद (राज्यसभा)', 'Patron • Former Member of Parliament (Rajya Sabha)',
      'राज्यसभा के पूर्व सदस्य (2008–2014), उत्तर प्रदेश। अलीगढ़ मुस्लिम विश्वविद्यालय के पूर्व छात्र एवं पूर्व कोर्ट सदस्य। संविधान, शिक्षा और वक़्फ़ संरक्षण के मुद्दों पर मुखर आवाज़।', 'patron', 1, '');
    ins.run('डॉ. मुमताज़ आलम रिज़वी', 'Dr. Mumtaz Alam Rizvi', 'राष्ट्रीय संयोजक', 'National Convenor',
      'भारतीय मुस्लिम मंच के राष्ट्रीय संयोजक। मंच के संगठनात्मक विस्तार और राज्यों/ज़िलों में इकाइयों के गठन का नेतृत्व।', 'convenor', 2, 'https://www.facebook.com/mumtaz.alam.1650');
    db.prepare("UPDATE leaders SET photo='/img/leaders/mumtaz.webp' WHERE grp='convenor'").run();
  }

  if (process.env.SEED_DEMO === '1' && !db.prepare('SELECT 1 FROM press LIMIT 1').get()) demo();
}

function demo() {
  const now = new Date();
  const d = (n) => new Date(now.getTime() - n * 864e5).toISOString().slice(0, 19).replace('T', ' ');
  const ds = (n) => new Date(now.getTime() + n * 864e5).toISOString().slice(0, 10);
  const p = db.prepare(`INSERT INTO press(title,summary,body,status,published_at,created_by) VALUES(?,?,?,'published',?,'demo')`);
  p.run('[नमूना] मंच ने नई सदस्यता अभियान की घोषणा की', 'यह एक नमूना प्रेस विज्ञप्ति है — असली विज्ञप्तियाँ एडमिन पैनल से जोड़ें।', '<p>यह केवल नमूना सामग्री है ताकि वेबसाइट का डिज़ाइन देखा जा सके। असली प्रेस विज्ञप्ति एडमिन पैनल में <b>प्रेस विज्ञप्ति</b> मेन्यू से जोड़ें।</p>', d(1));
  p.run('[नमूना] संविधान दिवस पर संगोष्ठी का आयोजन', 'नमूना सामग्री।', '<p>नमूना सामग्री।</p>', d(5));
  p.run('[नमूना] शिक्षा सहायता कार्यक्रम की जानकारी', 'नमूना सामग्री।', '<p>नमूना सामग्री।</p>', d(9));
  const e = db.prepare(`INSERT INTO events(title,description,venue,event_date,status) VALUES(?,?,?,?, 'published')`);
  e.run('[नमूना] राष्ट्रीय सदस्यता सम्मेलन', 'नमूना कार्यक्रम विवरण।', 'नई दिल्ली', ds(14));
  e.run('[नमूना] युवा संवाद', 'नमूना कार्यक्रम विवरण।', 'लखनऊ', ds(30));
  e.run('[नमूना] विधिक सहायता शिविर', 'नमूना कार्यक्रम विवरण।', 'अलीगढ़', ds(-10));
  db.prepare('INSERT INTO notices(text,sort) VALUES(?,1)').run('यह नमूना (डेमो) सामग्री है — असली सूचनाएँ एडमिन पैनल → सूचना पट्टी से जोड़ें।');
  db.prepare(`INSERT INTO units(state_code,state,district,head_name,head_title,phone) VALUES('UP','उत्तर प्रदेश','लखनऊ','[नमूना] प्रदेश अध्यक्ष','प्रदेश अध्यक्ष','')`).run();
  db.prepare(`INSERT INTO campaigns(title,description,active) VALUES('शिक्षा सहायता कोष','ज़रूरतमंद छात्रों की मदद',1)`).run();
}

if (require.main === module) { run(); console.log('seeded'); }
module.exports = { run };

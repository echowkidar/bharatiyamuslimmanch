# भारतीय मुस्लिम मंच — आधिकारिक वेबसाइट + एडमिन पैनल

Node.js (Express) + SQLite + Three.js/GSAP. एक ही कंटेनर, डेटा `/data` वॉल्यूम में।

## क्या-क्या है
**पब्लिक साइट** (हिंदी/English): 3D एनिमेटेड होम, नेतृत्व (संरक्षक मोहम्मद अदीब, राष्ट्रीय संयोजक डॉ. मुमताज़ आलम रिज़वी), मंच परिचय, प्रेस विज्ञप्ति, फ़ोटो/वीडियो गैलरी, कार्यक्रम, राज्य/ज़िला इकाइयाँ, ऑनलाइन सदस्यता फॉर्म, दान (PhonePe / UPI), सदस्यता कार्ड (QR सत्यापन, PNG/प्रिंट), रसीद, संपर्क फॉर्म, SEO (sitemap, OG tags).

**एडमिन पैनल** `/admin`: डैशबोर्ड • सदस्य (स्वीकृति/अस्वीकृति, पद, वैधता/रिन्यू, CSV आयात-निर्यात, कार्ड प्रिंट) • दान/भुगतान (UTR सत्यापन, ऑफ़लाइन/बैंक दान, रसीद, CSV) • वित्त रिपोर्ट + खर्च + अभियान + ₹20,000+ योगदान सूची • प्रेस विज्ञप्ति (रिच एडिटर, कवर, PDF) • गैलरी (एल्बम, बहु-फ़ोटो अपलोड, YouTube) • कार्यक्रम • नेतृत्व • इकाइयाँ • सूचना पट्टी • पेज (परिचय/नीतियाँ) • संदेश • उपयोगकर्ता (super / editor / accounts) • सेटिंग्स • गतिविधि लॉग.

## Portainer पर डिप्लॉय (मौजूदा temporary साइट बदलने के लिए)
1. इस रिपॉज़िटरी को Git में push करें (पुरानी static फ़ाइलें `legacy/` में रखी हैं)।
2. Portainer → Stacks → मौजूदा `bharatiyamuslimmanch` stack खोलें → **Pull and redeploy** (या Repository से नया stack)।
3. Stack के **Environment variables** में डालें (नमूना `.env.example`):
   - `SITE_URL=https://bharatiyamuslimmanch.org`
   - `APP_SECRET` = लंबा random string, `ADMIN_USER`, `ADMIN_PASSWORD` (पहला लॉगिन)
   - `PAYMENT_MODE=manual` और `UPI_ID=<आपकी UPI ID>` (PhonePe API स्वीकृत होने तक)
4. Nginx Proxy Manager में कुछ बदलना नहीं: container नाम `bharatiyamuslimmanch`, पोर्ट 80, नेटवर्क `npm-network` वही है। (यदि sysctl से port 80 न चले तो compose में `PORT: "3000"` करें और NPM में forward port 3000 कर दें।)
5. `https://bharatiyamuslimmanch.org/admin` पर लॉगिन → **पासवर्ड बदलें** → सेटिंग्स में फ़ोन/पता/सोशल लिंक भरें → पेज में "मंच परिचय" संपादित करें → नेतृत्व में फ़ोटो जोड़ें।
6. डेटा बैकअप: volume `bmm_data` (`/data/bmm.sqlite` + `/data/uploads`) का नियमित बैकअप लें।

## PhonePe पेमेंट गेटवे चालू करना
PhonePe Business डैशबोर्ड से **Client ID, Client Secret, Client Version** लें, फिर env में:
```
PAYMENT_MODE=phonepe
PHONEPE_ENV=sandbox          # टेस्ट के बाद production
PHONEPE_CLIENT_ID=...  PHONEPE_CLIENT_SECRET=...  PHONEPE_CLIENT_VERSION=1
PHONEPE_WEBHOOK_USER=...  PHONEPE_WEBHOOK_PASS=...   # डैशबोर्ड में webhook बनाते समय आप जो username/password चुनें
```
PhonePe डैशबोर्ड में Webhook URL: `https://bharatiyamuslimmanch.org/api/phonepe/webhook`
(एडमिन → सेटिंग्स में यही URL और स्थिति दिखती है)। हर भुगतान की पुष्टि PhonePe के Order-Status API से दोबारा की जाती है, केवल webhook पर भरोसा नहीं किया जाता। API का कोड `server/phonepe.js` में है; PhonePe अपने endpoint/फ़ील्ड बदले तो सिर्फ़ यही फ़ाइल बदलनी होगी। पहले sandbox में ₹1–₹10 का टेस्ट ज़रूर करें।

## लोकल चलाना
```
npm install
SEED_DEMO=1 ADMIN_PASSWORD=Test@12345 npm start     # http://localhost:3000  (PAYMENT_MODE अपने-आप mock)
npm run build:3d                                    # hero 3D दोबारा बनाना हो तो
```

## ज़रूरी नोट
- दान पर: भारतीय नागरिक घोषणा, ₹20,000+ पर PAN व पता अनिवार्य (सेटिंग्स में बदल सकते हैं)। राजनीतिक दल के चंदे/80GGC/चुनाव आयोग रिपोर्टिंग के नियम अपने CA/वकील से पक्के करें; नीति पेज (गोपनीयता/शर्तें/रिफंड) टेम्पलेट हैं, उन्हें जाँचकर बदलें।
- डेमो सामग्री केवल `SEED_DEMO=1` पर बनती है; production में बंद रखें।

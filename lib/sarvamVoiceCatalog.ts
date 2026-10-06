// Every R1 voice (200: v3 "classic" and v4 "studio"), as listed in the voice engine's library.
// Client-safe data only. Never show the engine's name to customers: these are "R1 voices".
//
// Calls: the engine sets the voice on the agent, not per call (a per-call override is ignored — tested 7 Oct 2026),
// so each voice is spoken by its own copy of the RANA Runtime agent. HQ → Voice engines connects a copy to a voice;
// until then calls use the closest connected voice (same gender).

export type R1Voice = {
  id: string;            // the engine's voice id (internal_id)
  name: string;          // "Kavitha - Conversational Voice"
  first: string;         // "Kavitha"
  role: string;          // "Conversational Voice" ("" for a v3 base voice)
  gender: "feminine" | "masculine";
  model: 3 | 4;          // v3 = classic, v4 = studio
  langs: string[];       // languages it sounds best in (every voice speaks all Indian languages)
  usecase: string;       // "Customer Support", "Sales", ...
  tone: string;          // "warm, low and lively"
  best: string;          // "customer support calls"
  intl: boolean;         // international (Western) English accent
};

// id|name|gender|model|best languages|use case|tone|best for|intl
const RAW = `01a0cf16-90ae-7470-941d-2c1f17b37528|Aarti - Support Agent|f|4|Hindi|Customer Support|sweet, high and soft-spoken|customer support calls|
01a0cf16-7021-76f7-a0cc-9d065cdb30a8|Aayan|m|3|Hindi||||
01a0cf17-18ac-7ceb-aac2-5f0c39f86831|Aayan - Conversational Voice|m|4|Hindi|Conversational|friendly, fast and expressive|natural back-and-forth conversation|
01a0e8fc-865c-715e-993e-3478d3a1fc1c|Aditi - Kids Storyteller|f|4|English|Storytelling|gentle, low and slow||
01a0cf16-5726-7055-8622-322e53f6bc77|Aditya|m|3|Hindi||||
01a0cf16-ffc4-7381-89d8-b12c13ae6cf9|Aditya - Conversational Voice|m|4|Hindi|Sales|persuasive, lively and slow|outbound sales and lead qualification|
01a0cf16-fd75-7f65-ad57-d0ca08ad4d7a|Aditya - Sales Agent|m|4|Hindi|Sales|confident, low and fast|outbound sales and lead qualification|
01a0cf16-73d4-78aa-a416-c593287484db|Advait|m|3|Hindi||||
01a0cf16-74c5-73da-acf9-372e030ce367|Amelia|f|3|English||||i
01a0cf1a-7d5a-7bca-a22b-f36f7c6c1bbe|Amelia - Conversational Voice|f|4|English|Conversational|friendly, low and expressive|natural back-and-forth conversation|i
01a0cf16-6001-7fac-b2c3-96de29fc6cd6|Amit|m|3|Hindi||||
01a0cf17-0934-7c93-9b52-fa62fcbdaa7b|Amit - Conversational Voice|m|4|Hindi|Conversational|flowing|natural back-and-forth conversation|
01a0cf16-9b1d-7e10-a8c6-447eb0ee4bfb|Anand - Conversational Voice|m|4|Punjabi|Conversational|friendly, hushed and expressive|natural back-and-forth conversation|
01a0e8fc-8a76-72d3-ae24-89b4688928eb|Anand - Documentary Voice|m|4|Hindi|Narration|clear, low and slow||
01a0cf16-9c1c-78d8-bfd2-7adb611935c5|Anand - Support Agent|m|4|Punjabi|Customer Support|warm, soft-spoken and expressive|customer support calls|
01a0e8fc-87f8-73ff-bbc9-2b8b802b2b13|Aparna - E-Learning Tutor|f|4|English|Educational|engaging, low and lively||
01a0cf16-8e7d-72c5-9a8b-e3c431253630|Aparna - KYC Agent|f|4|Hindi|Customer Support|professional, low and lively|video KYC and identity verification|
01a0cf16-8d27-75e7-a4f8-f71f57f86443|Aparna - Support Agent|f|4|Hindi|Customer Support|warm, low and lively|customer support calls|
01a0e8fc-88de-704c-a515-7fd4e7963156|Aravind - Ad Voice|m|4|Tamil|Advertisement|soft-spoken, highly expressive and deliberate||
01a0cf16-91b2-7d4a-9565-165855db219c|Arnab - Conversational Voice|m|4|Bengali|Conversational|high and flowing|natural back-and-forth conversation|
01a0e8fc-b993-7155-b2dd-fc6bb2d661ed|Aryaman - Formal Ad Voice|m|4|Hindi|Advertisement|premium, breathy and rough||
01a0cf16-729b-720b-bf53-1e18c3d5a5da|Ashutosh|m|3|Hindi||||
01a0cf17-00fc-7b7e-8352-37394d03344d|Ashutosh - Hindi Conversational Voice|m|4|Hindi|Conversational|brisk, flat and light|natural back-and-forth conversation|
01a0cf16-c5bd-7063-969f-2962475c911a|Bhavik - Conversational Voice|m|4|Gujarati|Conversational|calm and flat|natural back-and-forth conversation|
01a0cf16-944c-78eb-9f80-81eb02c4bcb9|Chaitra - Conversational Voice|f|4|Kannada|Conversational|low and brisk|natural back-and-forth conversation|
01a0cf16-955f-71e1-b1b6-68bf2fcf2172|Chaitra - Kannada Mix Support|f|4|Hindi,Kannada|Customer Support|warm, brisk and deliberate|customer support calls|
01a0cf16-96aa-7c19-89c0-2978daac5737|Chaitra - Narrator|f|4|Kannada|Narration|warm, low and soft-spoken|long-form narration and audiobooks|
01a0cf16-a424-75e1-8419-e1a0a756fc42|Chetan - Conversational Voice|m|4|Kannada|Conversational|fast, dark and deliberate|natural back-and-forth conversation|
01a0e8fc-a66d-788f-b29b-d0cf21dfdeeb|Chirag - Influencer Voice|m|4|Hindi|Social Media|viral, very high and slow||
01a0cf16-655d-78cb-8b68-a000a3e4878e|Dev|m|3|Hindi||||
01a0cf16-ac3f-7fcb-8ce6-19bb99b9620c|Dev - Conversational Voice|m|4|English|Conversational|friendly, very high and brisk|natural back-and-forth conversation|
01a0cf16-e314-7d09-b048-a41ff52f92fe|Deven - Conversational Voice|m|4|English|Conversational|very high, brisk and flat|natural back-and-forth conversation|
01a0e8fc-9892-7190-a72b-46baa8ea3a3d|Dev - Recovery Agent|m|4|English|Collections & Recovery|firm, very high and brisk||
01a0cf16-f8f8-7019-b275-b5d731be1c2d|Girish - Documentary Voice|m|4|English|Narration|authoritative, deep and lively|documentary narration|
01a0e8fc-8c09-7a4f-91dc-e8eb812b88e7|Gokul - Narrator|m|4|Tamil|Narration|measured, rough and high||
01a0cf16-e790-7000-86d5-2d57a740bb3a|Harpreet - Narrator|m|4|Punjabi|Narration|soft-spoken and expressive|long-form narration and audiobooks|
01a0cf16-6660-7ec9-9aed-c1f8ba75b896|Ishita|f|3|Hindi||||
01a0e8fc-b042-7326-a139-e97058ab7c50|Ishita - AI Companion|f|4|English,Hindi|Companion|intimate and breathy||
01a0cf16-b371-767c-b137-81a1cd4d9eed|Ishita - Conversational Voice|f|4|Marathi|Conversational|friendly, slow and expressive|natural back-and-forth conversation|
01a0e8fc-b332-7ea8-9f1d-4f5495aff777|Ishita - Devotional Narrator|f|4|Hindi|Storytelling|epic, rough and low||
01a0cf16-ecd8-7d99-8aab-265fd11bc871|Ishita - E-Learning Tutor|f|4|Hindi|Educational|clear, slow and expressive|e-learning and training material|
01a0e8fc-b0f1-72a6-ad04-96656a0d28d2|Ishita - English Influencer Voice|f|4|English|Social Media|high, soft-spoken and slow||
01a0cf16-eba8-7528-a44c-eb42d4b2b5d9|Ishita - English Numbers Specialist|f|4|English|Customer Support|warm, expressive and rough|number-heavy support calls|
01a0cf16-e9ab-77e9-9953-2238f05c7110|Ishita - English Support Agent|f|4|English|Customer Support|warm, high and hushed|customer support calls|
01a0cf16-b252-7218-996b-1d4902aae830|Ishita - Expressive Banking Agent|f|4|Hindi|Customer Support|warm, high and hushed|banking and BFSI support calls|
01a0cf16-e8b3-7f97-909b-27be790e7330|Ishita - Expressive Support|f|4|English,Hindi|Customer Support|slow|customer support calls|
01a0cf16-eddc-7cb3-823b-88731b6cbe29|Ishita - Hindi Numbers Specialist|f|4|Hindi|Customer Support|warm, slow and expressive|number-heavy support calls|
01a0cf17-0b6e-79f0-b8ab-7392cabc497b|Ishita - Hinglish Support Agent|f|4|English,Hindi|Customer Support|warm, high and hushed|customer support calls|
01a0e8fc-b2bb-781b-a7fa-f5b43f946f03|Ishita - Informal Ad Voice|f|4|Hindi|Advertisement|massy, rough and high||
01a0cf16-eabc-779c-a266-b37c1967acb3|Ishita - Medical Support|f|4|English|Customer Support|warm, soft-spoken and expressive|healthcare and patient support calls|
01a0e8fc-b168-741f-87a9-3ba15a7628ec|Ishita - Storyteller|f|4|English|Storytelling|highly expressive||
01a0cf16-e6a7-7fc5-aecc-b223bc3bb8db|Jaspal - Accent Banking Agent|m|4|Punjabi|Customer Support|warm, high and expressive|banking and BFSI support calls|
01a0cf16-6ecd-7a97-b86b-f91eeadd5bd7|Kabir|m|3|Hindi||||
01a0cf17-13fb-71b7-83c5-f8e21aca30fa|Kabir - Conversational Voice|m|4|Hindi|Conversational|friendly, low and expressive|natural back-and-forth conversation|
01a0cf16-f79a-751d-bd70-268bc86caf13|Kalpit - E-Learning Tutor|m|4|English|Educational|warm, high and high-energy|e-learning and training material|
01a0cf16-b474-782d-9743-13bdfc4c9a25|Kangkana - Conversational Voice|f|4|Assamese|Conversational|friendly, low and soft-spoken|natural back-and-forth conversation|
01a0cf16-897b-76f8-8de9-34f27e861df6|Kavitha - Conversational Voice|f|4|Telugu|Conversational|easygoing, high and soft-spoken|natural back-and-forth conversation|
01a0cf16-8ac9-7d36-866f-b19d0c05a72d|Kavitha - Narrator|f|4|Telugu|Narration|measured, very high and hushed|long-form narration and audiobooks|
01a0cf16-5f09-7c65-b9e6-9fe94b0e9441|Kavya|f|3|Hindi||||
01a0cf17-17b8-7952-ab5c-ed9ea97a6925|Kavya - Conversational Voice|f|4|Hindi|Conversational|friendly and expressive|natural back-and-forth conversation|
01a0e8fc-a929-7b3a-b827-a0fba19fe140|Mahesh - Documentary Voice|m|4|Hindi|Narration|clear, low and expressive||
01a0cf16-6b54-7b44-8dff-e67586a9762a|Manan|m|3|Hindi||||
01a0cf17-0c6f-74a6-8a00-58887513283b|Manan - Conversational Voice|m|4|Hindi|Conversational|friendly, high and soft-spoken|natural back-and-forth conversation|
01a0cf16-b14e-7e33-ac4f-40319985b577|Mani - Conversational Voice|m|4|Hindi|Narration|low, soft-spoken and slow|long-form narration and audiobooks|
01a0cf16-92ef-7beb-a599-7def88873140|Mohit - Conversational Voice|m|4|Hindi|Conversational|friendly, highly expressive and light|natural back-and-forth conversation|
01a0cf17-1650-73b7-ac23-aad040439447|Mouchumi - Conversational Voice|f|4|Assamese|Conversational|brisk, breathy and full|natural back-and-forth conversation|
01a0cf16-ef1b-7525-91f7-03bca0da8bf4|Mrunal - Narrator|f|4|Marathi|Narration|measured, slow and expressive|long-form narration and audiobooks|
01a0e8fc-a787-72de-8991-3815a7b78340|Mukul - Ad Voice|m|4|Hindi|Advertisement|breathy, slow and expressive||
01a0e8fc-a710-7886-84c3-a7915547d899|Mukul - Storyteller|m|4|Marathi|Storytelling|breathy, lively and brisk||
01a0e8fc-9e3e-79c2-9d48-f9655a94abf7|Nachiket - Formal Ad Voice|m|4|English|Advertisement|polished, breathy and lively||
01a0cf16-9a05-79b1-8110-4b923c936015|Neha - Narrator|f|4|Marathi|Narration|measured, low and expressive|long-form narration and audiobooks|
01a0cf16-98e5-7477-b1c4-73db8ad8ba82|Neha - Support Agent|f|4|English|Customer Support|calm, low and brisk|customer support calls|
01a0cf16-f342-7d26-8a95-9944e6556c3c|Nilesh - Conversational Voice|m|4|Marathi|Conversational|natural, low and soft-spoken|natural back-and-forth conversation|
01a0e8fc-ad43-7e8e-b735-f39d2ac0c55d|Ojas - Influencer Voice|m|4|English|Social Media|low and fast||
01a0cf16-aff2-7919-b06c-9c03433f2ffd|Payal - E-Learning Tutor|f|4|English|Educational|engaging, high-energy and expressive|e-learning and training material|
01a0cf16-5b63-7257-b2ca-d373149dfb2a|Pooja|f|3|Hindi||||
01a0cf17-07ec-7e82-976c-1115f36dda1b|Pooja - Gujarati Conversational Voice|f|4|Gujarati|Customer Support|warm, slow and expressive|customer support calls|
01a0cf16-ad8b-762d-8e12-73ddbae38db8|Pooja - Support Agent|f|4|Gujarati|Customer Support|sweet, high and hushed|customer support calls|
01a0cf16-aee5-7a59-981c-e4e7b8b148a0|Pooja - Telugu Conversational Voice|f|4|Telugu|Conversational|friendly, high and lively|natural back-and-forth conversation|
01a0cf16-5959-79cb-9949-247c5a33bd48|Priya|f|3|Hindi||||
01a0cf17-154d-7cc0-b5c3-b11b350d519b|Priya - Recovery Agent|f|4|Hindi|Collections & Recovery|firm, low and expressive|collections and payment recovery calls|
01a0cf16-5a52-747d-8900-0a77b9f5402c|Rahul|m|3|Hindi||||
01a0cf17-05b0-72d6-96e2-8ba654e2ceb5|Rahul - Conversational Voice|m|4|Hindi|Conversational|easygoing, high and hushed|natural back-and-forth conversation|
01a0cf16-68c6-7341-8408-bceec24a6a06|Ratan|m|3|Hindi||||
01a0cf16-f006-71d6-8c0a-30bfcd271608|Ratan - Documentary Voice|m|4|Hindi|Narration|calm, lively and slow|documentary narration|
01a0cf16-9d41-700a-9218-57c5c0d5b0b0|Ratan - Expressive Support Agent|m|4|Hindi|Customer Support|warm, low and fast|customer support calls|
01a0e8fc-b537-753d-a255-5eb9b723e77c|Ratan - Influencer Voice|m|4|Hindi|Social Media|charming, high and lively||
01a0cf16-f123-7e58-abbb-fb228fed7896|Ratan - Recovery Agent|m|4|Hindi|Collections & Recovery|firm, low and brisk|collections and payment recovery calls|
01a0e8fc-8b69-782b-8565-9c87f47373b6|Ratan - Warm Night Companion|m|4|Hindi|Companion|warm, breathy and fast||
01a0e8fc-ba0c-75a2-883e-694043df8d52|Rehan - Influencer Voice|m|4|Hindi|Social Media|energetic, high and high-energy||
01a0cf16-5817-79d0-bf32-972e399087db|Ritu|f|3|Hindi||||
01a0cf16-da10-74b6-a33b-9640d0f046fd|Ritu - Banking Support|f|4|Hindi|Customer Support|high, high-energy and bright|banking and BFSI support calls|
01a0cf16-d697-7eb3-b04f-79641a0aaef2|Ritu - Conversational Voice|f|4|Hindi|Conversational|natural, high and lively|natural back-and-forth conversation|
01a0cf16-d30b-796e-b775-e33f383b004b|Ritu - English E-Learning Tutor|f|4|English|Educational|engaging, high and high-energy|e-learning and training material|
01a0cf16-d447-7a70-a2a0-4dc350038a24|Ritu - English Medical Support|f|4|English|Customer Support|gentle, lively and brisk|healthcare and patient support calls|
01a0e8fc-aa0e-78f5-96a4-b4640a6446f9|Ritu - English Reel Voice|f|4|English|Social Media|sweet, high and slow||
01a0e8fc-ab43-77e8-ab9d-2cec9ec5dfac|Ritu - Formal Ad Voice|f|4|Hindi|Advertisement|massy, high and high-energy||
01a0cf16-d8d6-70e3-8282-7494b008cb37|Ritu - Hindi E-Learning Tutor|f|4|Hindi|Educational|engaging, high-energy and slow|e-learning and training material|
01a0cf16-db1d-7fa1-b803-6c76b70c2917|Ritu - Hindi Insurance Agent|f|4|Hindi|Customer Support|warm, high and soft-spoken|insurance support and policy renewals|
01a0cf16-dc66-7811-a129-ac6855ef5ca9|Ritu - Hindi Medical Support|f|4|Hindi|Customer Support|gentle, lively and expressive|healthcare and patient support calls|
01a0cf17-0200-70eb-86af-68c0147d2351|Ritu - Hindi Support Agent|f|4|Hindi|Customer Support|warm, high and lively|customer support calls|
01a0e8fc-accd-7171-b0e6-e952a20fc408|Ritu - Influencer Voice|f|4|Hindi|Social Media|energetic, very high and slow||
01a0e8fc-abc0-7c93-aa6a-174eb836a648|Ritu - Informal Ad Voice|f|4|Hindi|Advertisement|massy, very high and high-energy||
01a0cf16-8c17-7394-a54d-d11431e8a13a|Ritu - Interactive E-Learning Tutor|f|4|Hindi|Educational|engaging, high and high-energy|e-learning and training material|
01a0e8fc-86d1-72b5-89d8-37018dd049b4|Ritu - Lively Reel Voice|f|4|Hindi|Social Media|sweet, rough and high||
01a0cf16-de84-785d-b91b-7b47965d373d|Ritu - Marathi Insurance Agent|f|4|Marathi|Customer Support|warm, high and lively|insurance support and policy renewals|
01a0cf16-df9b-76dc-a9e1-e3981efacba0|Ritu - Narrator|f|4|Marathi|Narration|smooth, slow and breathy|long-form narration and audiobooks|
01a0cf16-dd5f-77fa-8a45-4a6c01663eb1|Ritu - Sales Agent|f|4|Hindi|Sales|warm, high and lively|outbound sales and lead qualification|
01a0cf16-d541-7554-a9ad-1e8964aeb427|Ritu - Utility Support|f|4|Hindi|Customer Support|warm, high and high-energy|utility and billing support calls|
01a0cf16-d7da-7f22-b00b-b454c7a709ba|Ritu - Warm Support Agent|f|4|Hindi|Customer Support|warm, high and lively|customer support calls|
01a0cf16-5c61-787d-a83f-ae54ce8c0f96|Rohan|m|3|Hindi||||
01a0cf16-9f7d-7b97-a504-2bb53b3ebd39|Rohan - Recovery Agent|m|4|English|Collections & Recovery|firm, high and soft-spoken|collections and payment recovery calls|
01a0cf16-6db9-7f80-9368-0bf6f695d08e|Roopa|f|3|Hindi||||
01a0e8fc-b801-7a88-a9c6-7c4dc2755a01|Roopa - AI Companion|f|4|Hindi|Companion|soothing, soft-spoken and expressive||
01a0cf16-e562-7c39-a3fb-24ec65422292|Roopa - Bengali Conversational Voice|f|4|Bengali|Conversational|friendly, high and lively|natural back-and-forth conversation|
01a0e8fc-b777-79fe-be74-548740a07d96|Roopa - English Conversational Voice|f|4|English|Conversational|friendly, expressive and full||
01a0cf16-f693-7823-b244-369096928e66|Roopa - Hindi Conversational Voice|f|4|Hindi|Conversational|friendly, hushed and expressive|natural back-and-forth conversation|
01a0cf16-f569-72ca-b0a6-e1e973c00ae7|Roopa - Market Analyst|f|4|Hindi|Customer Support|warm, high and expressive|share market and finance updates|
01a0cf16-f486-7d5c-b1cc-7f6a3eef52e3|Roopa - Narrator|f|4|Hindi|Narration|low, hushed and dark|long-form narration and audiobooks|
01a0e8fc-b87f-7efc-a4a0-908a32674ffb|Roopa - Recovery Agent|f|4|Hindi|Collections & Recovery|full and flowing||
01a0e8fc-8c7f-7a29-ad18-34060dd8bac2|Rupali - Story Narrator|f|4|Marathi|Storytelling|rough and soft-spoken||
01a0cf16-ca3d-739c-aaa2-2a9d61f94abf|Sanchita - AI Assistant|f|4|Hindi|Assistant & IVR|crisp, high-energy and brisk|voice assistants and smart devices|
01a0cf16-cc50-70f1-a3c2-fc8b0afff87e|Sanchita - E-Learning Tutor|f|4|Hindi|Educational|engaging, high-energy and expressive|e-learning and training material|
01a0e8fc-a176-70dc-8444-4043e6271041|Sanchita - English Influencer Voice|f|4|English|Social Media|punchy, lively and expressive||
01a0cf16-c8fa-7c70-a30e-0896e4695e86|Sanchita - English Market Analyst|f|4|English|Customer Support|high-energy, bright and light|share market and finance updates|
01a0cf16-c7f5-7248-8cf6-4eb9a5bb264d|Sanchita - English Recovery Agent|f|4|English|Collections & Recovery|professional, low and lively|collections and payment recovery calls|
01a0cf16-cb52-7d7d-b708-4ae241366ee1|Sanchita - Expressive Banking Agent|f|4|Hindi|Customer Support|high, high-energy and brisk|banking and BFSI support calls|
01a0cf16-cd9f-7de5-b8e3-7d438ebb57cd|Sanchita - Feedback Agent|f|4|Hindi|Assistant & IVR|high, high-energy and rough|feedback and survey calls|
01a0e8fc-a296-7e2c-a431-b055396bb790|Sanchita - Formal Ad Voice|f|4|Hindi|Advertisement|calm and low||
01a0e8fc-a461-75e4-b7d4-43e84745eee6|Sanchita - Hindi Influencer Voice|f|4|Hindi|Social Media|punchy, rough and high||
01a0cf16-cfd4-71b3-9254-b921720f3ed0|Sanchita - Hindi Market Analyst|f|4|Hindi|Customer Support|high, high-energy and slow|share market and finance updates|
01a0e8fc-a31d-7e65-a508-8b62a5d45639|Sanchita - Informal Ad Voice|f|4|Hindi|Advertisement|massy, high and high-energy||
01a0cf16-c6b0-74a8-93b8-0f8fbd35a74d|Sanchita - Insurance Agent|f|4|English|Customer Support|warm, low and lively|insurance support and policy renewals|
01a0cf16-cea3-70e6-931b-9dc276d6675f|Sanchita - Interviewer|f|4|Hindi|Assistant & IVR|high-energy, expressive and rough|interview and screening flows|
01a0cf16-d0cd-7e3a-a054-2bb4a1310538|Sanchita - KYC Agent|f|4|Hindi|Customer Support|professional, high and high-energy|video KYC and identity verification|
01a0cf16-97b2-72b5-bdc4-4785b7a334ed|Sarika - Conversational Voice|f|4|Hindi|Conversational|friendly, low and soft-spoken|natural back-and-forth conversation|
01a0e8fc-a5ba-71fe-abcc-5543b864c9fb|Shabana - E-Learning Tutor|f|4|English|Educational|clear, high and slow||
01a0cf16-a1c6-7d20-8675-7b4941347f1e|Shalini - English Support Agent|f|4|English|Customer Support|warm, very high and soft-spoken|customer support calls|
01a0cf16-a0c0-76f9-8d2e-79635434a78a|Shalini - Hinglish Support Agent|f|4|English,Hindi|Customer Support|warm, low and expressive|customer support calls|
01a0cf16-d212-7f69-b4e0-60b1b45d8c29|Shilpa - Malayalam Mix Narrator|f|4|Hindi,Malayalam|Narration|clear, low and flat|long-form narration and audiobooks|
01a0cf16-67bf-76f0-8420-2ce24e69cffb|Shreya|f|3|Hindi||||
01a0e8fc-ba8b-79c2-83f9-f64f06fa03f1|Shreya - Conversational Voice|f|4|Hindi|News & Sports|soft-spoken, full and flowing||
01a0e8fc-9a2a-76d9-b143-e250fa1d6be1|Shruti - E-Learning Tutor|f|4|Hindi|Educational|engaging, high and lively||
01a0cf16-7179-7472-b7df-b7b432d5faa5|Shubh|m|3|Hindi||||
01a0e8fc-9123-73bb-bd4e-04df4741957a|Shubh - AI Companion|m|4|English,Hindi|Companion|low and lively||
01a0cf16-a6b6-7d2d-ad5f-f5217057fde8|Shubh - E-commerce Voice|m|4|Hindi|Customer Support|warm, hushed and brisk|e-commerce journeys and order updates|
01a0e8fc-9194-77f6-b332-6fc62ea6436b|Shubh - English Ad Voice|m|4|English|Advertisement|premium, breathy and low||
01a0cf16-ab28-7a75-9afc-986c19cf77c9|Shubh - English Audiobook Narrator|m|4|English|Narration|smooth, low and unhurried|long-form audiobooks|
01a0cf16-a9e8-7290-afe4-15f081b1f778|Shubh - English Recovery Agent|m|4|English|Collections & Recovery|firm, low and soft-spoken|collections and payment recovery calls|
01a0cf16-a571-7451-a420-be5f97e71f71|Shubh - Expressive Banking Agent|m|4|English,Hindi|Customer Support|warm, soft-spoken and expressive|banking and BFSI support calls|
01a0e8fc-9701-77b1-a93c-d141554b8130|Shubh - Hindi Ad Voice|m|4|Hindi|Advertisement|premium, breathy and low||
01a0cf16-fc22-79bf-8399-c9723ce4b066|Shubh - Hindi Recovery Agent|m|4|Hindi|Collections & Recovery|firm, brisk and expressive|collections and payment recovery calls|
01a0e8fc-bc83-7913-9400-111eb9974666|Shubh - Hinglish Ad Voice|m|4|English,Hindi|Advertisement|hushed and brisk||
01a0e8fc-968c-7a81-84f5-834465271113|Shubh - Longform Storyteller|m|4|Hindi|Storytelling|natural, low and soft-spoken||
01a0cf16-a8f0-7b76-95d7-5739ee7f8646|Shubh - Numbers Specialist|m|4|English|Customer Support|warm and highly expressive|number-heavy support calls|
01a0e8fc-981b-7963-9817-ff955cbb8b9b|Shubh - Storyteller|m|4|Hindi|Storytelling|dramatic, low and soft-spoken||
01a0cf16-fb22-7a60-be62-e9bd036a6dab|Shubh - Support Agent|m|4|Hindi|Customer Support|warm, hushed and fast|customer support calls|
01a0cf16-5db4-7924-a37d-8f3bb1234d7c|Simran|f|3|Hindi||||
01a0cf16-beba-74d5-b4e1-fa97f11587f6|Simran - AI Assistant|f|4|Hindi|Assistant & IVR|measured, low and slow|voice assistants and smart devices|
01a0e8fc-9b0d-7595-b5b6-4ba0d403c566|Simran - AI Companion|f|4|English,Hindi|Companion|low and expressive||
01a0e8fc-9d8f-7ba3-9397-3c0443e9f918|Simran - Energetic Influencer Voice|f|4|Hindi|Social Media|energetic, very high and high-energy||
01a0cf16-b718-7896-89b7-f64266beb2c8|Simran - English Audio Describer|f|4|English|Narration|mature, low and lively|audio description and accessibility work|
01a0cf16-b828-78d4-819d-0ec6fc85b3f0|Simran - English Auto Advisor|f|4|English|Customer Support|confident and low|automotive and mobility content|
01a0cf16-b98a-7203-8697-5e09e2b95a62|Simran - English Conversational Voice|f|4|English|Conversational|friendly, low and expressive|natural back-and-forth conversation|
01a0cf16-bba3-7c6d-a76d-b866f9063987|Simran - English E-Learning Tutor|f|4|English|Educational|engaging, high and lively|e-learning and training material|
01a0cf16-bc9f-724e-a450-37b605a509f8|Simran - English Recovery Agent|f|4|English|Collections & Recovery|firm, low and brisk|collections and payment recovery calls|
01a0cf16-bdbf-7e26-bdc5-0235e462d043|Simran - English Sales Agent|f|4|English|Sales|engaging, low and brisk|outbound sales and lead qualification|
01a0cf16-ba80-7ea3-9e61-8e5a0381560b|Simran - English Support Agent|f|4|English|Customer Support|warm, brisk and expressive|customer support calls|
01a0e8fc-afcd-77b6-acfe-4c0341856ee6|Simran - Excited Influencer Voice|f|4|Hindi|Social Media|energetic, rough and high||
01a0cf16-b5cd-7a8b-a0f5-f3889c932e82|Simran - Expressive Banking Agent|f|4|English,Hindi|Customer Support|warm, low and brisk|banking and BFSI support calls|
01a0cf16-c013-7907-8311-4977d02f37f5|Simran - Hindi Audio Describer|f|4|Hindi|Narration|mature, low and lively|audio description and accessibility work|
01a0cf16-c153-7c18-bee4-b599f3a8f423|Simran - Hindi Auto Advisor|f|4|Hindi|Customer Support|confident, low and lively|automotive and mobility content|
01a0cf16-c253-72de-a0e3-d99c8127a4bd|Simran - Hindi Conversational Voice|f|4|Hindi|Conversational|friendly, low and soft-spoken|natural back-and-forth conversation|
01a0cf16-c38c-7c6c-8e6a-f0bd7af56a16|Simran - Hindi Recovery Agent|f|4|Hindi|Collections & Recovery|firm, low and brisk|collections and payment recovery calls|
01a0cf16-c494-7231-b33d-fc186090959f|Simran - Hindi Sales Agent|f|4|Hindi|Sales|engaging, low and brisk|outbound sales and lead qualification|
01a0cf17-12bd-7de3-9df0-f607db604d52|Simran - Hinglish Support Agent|f|4|English,Hindi|Customer Support|warm, low and brisk|customer support calls|
01a0e8fc-aee0-7e7b-9dd9-11c12bbe2bcd|Simran - Interactive E-Learning Tutor|f|4|English|Educational|engaging, rough and high||
01a0e8fc-9b80-7cb2-aaec-6a9b030b4d36|Simran - Therapist Voice|f|4|English|Companion|friendly, low and soft-spoken||
01a0e8fc-adb6-7248-82fc-32e26e12097f|Soham - Natural Narrator|m|4|Marathi|Narration|natural, low and soft-spoken||
01a0cf16-7609-76eb-8de1-558e6c4a3067|Sophia|f|3|English||||i
01a0cf1a-7e84-7b02-af0f-cc692f99bcc3|Sophia - Conversational Voice|f|4|English|Conversational|friendly, low and soft-spoken|natural back-and-forth conversation|i
01a0cf16-e0d7-7870-a832-83bdd785052c|Suchitra - E-commerce Voice|f|4|Hindi|Customer Support|low, brisk and dark|e-commerce journeys and order updates|
01a0cf16-e219-74ee-8e6c-a1e3d5df8d11|Suchitra - Narrator|f|4|Kannada|Narration|measured, low and soft-spoken|long-form narration and audiobooks|
01a0e8fc-9f41-7d10-9f15-1720a4b077d0|Suhani - Influencer Voice|f|4|Hindi|Social Media|rough, high and expressive||
01a0e8fc-a540-7db8-b919-feda80526484|Suman - AI Companion|f|4|Hindi|Companion|sweet, breathy and high||
01a0cf16-6c54-746b-815a-2e1cf51a473a|Sumit|m|3|Hindi||||
01a0cf17-0da5-7275-900c-186dfec4d34f|Sumit - Conversational Voice|m|4|Hindi|Conversational|friendly, high and hushed|natural back-and-forth conversation|
01a0e8fc-9238-7c94-b100-7f45fd47eb1f|Sunny - Influencer Voice|m|4|English|Social Media|soft-spoken and expressive||
01a0e8fc-9618-7a94-8176-be79e8d396b5|Sunny - Mass Ad Voice|m|4|Hindi|Advertisement|massy, lively and slow||
01a0e8fc-9775-7d6c-87ff-62d983f34f06|Sunny - Reel Voice|m|4|Hindi|Social Media|punchy, high and soft-spoken||
01a0cf17-0379-7e04-9e7f-9955e5a97657|Sunny - Support Agent|m|4|English,Hindi|Customer Support|warm, high and soft-spoken|customer support calls|
01a0cf16-a32a-730c-9800-0451f3f6598e|Tanya - Telugu Mix Narrator|f|4|Hindi,Telugu|Narration|rich and bright|long-form narration and audiobooks|
01a0cf17-06f8-75f3-bda1-a9b4c637a4a4|Tarun - Conversational Voice|m|4|Hindi|Sales|persuasive, high and soft-spoken|outbound sales and lead qualification|
01a0cf16-9e86-7043-9562-96c80fd0e6ac|Tarun - Narrator|m|4|Telugu|Narration|measured, highly expressive and rough|long-form narration and audiobooks|
01a0cf16-8f90-7ce7-8059-40c0005070ee|Tarun - Sales Agent|m|4|Hindi|Sales|confident, fast and expressive|outbound sales and lead qualification|
01a0cf16-e455-7887-b274-77f1c903825f|Vandana - E-commerce Voice|f|4|Hindi|Customer Support|slow, full and flowing|e-commerce journeys and order updates|
01a0cf16-6a07-7cee-b592-494b2d213be1|Varun|m|3|Hindi||||
01a0e8fc-90ad-7ee4-9d75-499eeede64ff|Varun - Premium Ad Voice|m|4|English|Advertisement|cinematic, breathy and low||
01a0cf16-f218-7a59-868c-9bb12217a292|Vijay - Narrator|m|4|Tamil|Narration|measured, hushed and expressive|long-form narration and audiobooks|
01a0cf16-fec7-72d5-8803-5ea3ea7b5e8a|Zarina - Conversational Voice|f|4|English|Conversational|deep, full and flowing|natural back-and-forth conversation|`;

export const R1_CATALOG: R1Voice[] = RAW.split("\n").map((line) => {
  const [id, name, g, m, langs, usecase, tone, best, intl] = line.split("|");
  const [first, ...rest] = name.split(" - ");
  return {
    id, name, first: first.trim(), role: rest.join(" - ").trim(), gender: g === "m" ? "masculine" : "feminine", model: m === "4" ? 4 : 3,
    langs: langs ? langs.split(",") : [], usecase: usecase || "General", tone: tone || "warm and natural", best: best || "", intl: intl === "i",
  } as R1Voice;
});

const BY_ID = new Map(R1_CATALOG.map((v) => [v.id, v]));
const BY_NAME = new Map(R1_CATALOG.map((v) => [v.name.toLowerCase(), v]));

/** A voice by its id or full name ("Kavitha - Conversational Voice"), or a v3 base voice by first name ("kavya"). */
export function findR1Voice(idOrName: string | null | undefined): R1Voice | null {
  const k = String(idOrName || "").trim();
  if (!k) return null;
  return BY_ID.get(k) || BY_NAME.get(k.toLowerCase()) || null;
}

export const R1_USECASES = Array.from(new Set(R1_CATALOG.map((v) => v.usecase))).sort();
export const R1_LANGS = Array.from(new Set(R1_CATALOG.flatMap((v) => v.langs))).sort();

/** Short line for a card: "Female · v4 · Customer Support · warm, low and lively". */
export function r1Blurb(v: R1Voice): string {
  return [v.gender === "masculine" ? "Male" : "Female", `v${v.model}`, v.usecase !== "General" ? v.usecase : "", v.tone].filter(Boolean).join(" · ");
}

/** Names the speech engine's plain text-to-speech accepts (used for "Hear" samples). A v4 voice previews with its base voice. */
export const R1_TTS_SPEAKERS = ["shubh", "aditya", "ritu", "priya", "neha", "rahul", "pooja", "rohan", "simran", "kavya", "amit", "dev", "ishita", "shreya", "ratan", "varun", "manan", "sumit", "roopa", "kabir", "aayan", "ashutosh", "advait", "anand", "tanya", "tarun", "sunny", "mani", "gokul", "vijay", "shruti", "suhani", "mohit", "kavitha", "rehan", "soham", "rupali"];
export function r1PreviewSpeaker(v: R1Voice): string | null {
  const s = v.first.toLowerCase();
  return R1_TTS_SPEAKERS.includes(s) ? s : null;
}

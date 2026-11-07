import { section } from "../define";

type Doc = { title: string; sections: { h: string; p: string }[] };

const en: Record<"terms" | "privacy" | "risk" | "refunds", Doc> & { draft: string; updated: string } = {
  draft: "Draft for legal review — not legally binding in this prototype.",
  updated: "Draft dated 2026-10-15",
  terms: {
    title: "Terms of use",
    sections: [
      { h: "1. The service", p: "ALPAS provides a skills evaluation on simulated trading accounts. No client funds are deposited, held or invested. Accounts, prices and executions are simulated." },
      { h: "2. Eligibility", p: "You must be at least 18 and not resident in a jurisdiction where the service is prohibited. ALPAS may refuse or close accounts to comply with law or sanctions." },
      { h: "3. Fees", p: "The evaluation fee is paid once per challenge for the evaluation service. It is not a deposit and does not buy trading capital. The fee is refunded only as described in the refund policy." },
      { h: "4. Rules and versions", p: "Each challenge is governed by the rule version published at the time of purchase, which is locked to that challenge. New versions apply to new purchases." },
      { h: "5. Breaches and prohibited practices", p: "Reaching a loss limit closes the account. Prohibited practices may lead to rejection of a review or a reward. Every such decision is recorded with a reason." },
      { h: "6. Funded stage and rewards", p: "A funded account is a simulated account. Performance rewards are calculated from simulated profit, require identity verification and a signed trader agreement, and are paid only after review." },
      { h: "7. Liability", p: "Evaluation results are not investment advice. ALPAS does not guarantee any outcome, review time or reward amount." },
    ],
  },
  privacy: {
    title: "Privacy notice",
    sections: [
      { h: "What we process", p: "Account data (name, e-mail, country), order data, trading activity on simulated accounts, identity verification data and support messages." },
      { h: "Why", p: "To provide the evaluation, calculate rules and rewards, meet legal obligations (identity, sanctions) and answer support requests." },
      { h: "Assistant", p: "ALPAS Assistant uses only data from your own accounts that is needed to answer. Questions may be stored to improve help content. Personal data is not sent to third-party AI providers unless such a provider is configured and disclosed." },
      { h: "Certificates", p: "Public verification pages show only the name on the certificate, programme, amount, date and status — never e-mail or balances." },
      { h: "This prototype", p: "Demo data is stored only in your browser's local storage and can be deleted with Reset demo data." },
    ],
  },
  risk: {
    title: "Risk disclosure",
    sections: [
      { h: "Simulated environment", p: "All trading on ALPAS accounts is simulated. Results may differ from live markets, including execution, slippage and liquidity." },
      { h: "No investment advice", p: "Nothing on this site is investment advice or an offer of financial services." },
      { h: "Fees can be lost", p: "Most evaluations do not reach the funded stage. You should only pay a fee you can afford to lose." },
      { h: "Leverage", p: "Simulated leverage magnifies gains and losses and can reach a loss limit quickly." },
    ],
  },
  refunds: {
    title: "Refund policy",
    sections: [
      { h: "Fee refund through the first payout", p: "The evaluation fee is refunded once, as a separate line added to your first payout that reaches Paid status. It is not subject to the profit split." },
      { h: "Before trading starts", p: "Draft position: a fee may be refunded on request within 14 days of purchase if no position has been opened on the account, subject to applicable consumer law." },
      { h: "No other refunds", p: "Fees are not refunded after a breach, an expired account or a rejected review." },
      { h: "This prototype", p: "No payments are taken in the prototype, so no refunds are processed." },
    ],
  },
};

const tr: typeof en = {
  draft: "Hukuk incelemesi için taslak — bu prototipte hukuken bağlayıcı değildir.",
  updated: "Taslak tarihi 2026-10-15",
  terms: {
    title: "Kullanım koşulları",
    sections: [
      { h: "1. Hizmet", p: "ALPAS, simüle işlem hesaplarında beceri değerlendirmesi sunar. Müşteri fonu yatırılmaz, tutulmaz veya yatırıma yönlendirilmez. Hesaplar, fiyatlar ve işlemler simüledir." },
      { h: "2. Uygunluk", p: "En az 18 yaşında olmalı ve hizmetin yasak olduğu bir yerde ikamet etmemelisiniz. ALPAS, mevzuat veya yaptırımlara uymak için hesapları reddedebilir veya kapatabilir." },
      { h: "3. Ücretler", p: "Değerlendirme ücreti, her challenge için değerlendirme hizmeti karşılığında bir kez ödenir. Bir mevduat değildir ve işlem sermayesi satın almaz. Ücret yalnızca iade politikasında açıklandığı şekilde iade edilir." },
      { h: "4. Kurallar ve sürümler", p: "Her challenge, satın alma anında yayımlanan ve o challenge'a kilitlenen kural sürümüne tabidir. Yeni sürümler yeni satın almalara uygulanır." },
      { h: "5. İhlaller ve yasaklı uygulamalar", p: "Bir zarar limitine ulaşmak hesabı kapatır. Yasaklı uygulamalar bir incelemenin veya ödülün reddine yol açabilir. Her karar gerekçesiyle kaydedilir." },
      { h: "6. Funded aşama ve ödüller", p: "Funded hesap simüle bir hesaptır. Performans ödülleri simüle kârdan hesaplanır, kimlik doğrulama ve imzalı trader sözleşmesi gerektirir ve yalnızca incelemeden sonra ödenir." },
      { h: "7. Sorumluluk", p: "Değerlendirme sonuçları yatırım tavsiyesi değildir. ALPAS hiçbir sonucu, inceleme süresini veya ödül tutarını garanti etmez." },
    ],
  },
  privacy: {
    title: "Gizlilik bildirimi",
    sections: [
      { h: "Neleri işleriz", p: "Hesap verileri (ad, e-posta, ülke), sipariş verileri, simüle hesaplardaki işlem hareketleri, kimlik doğrulama verileri ve destek mesajları." },
      { h: "Neden", p: "Değerlendirmeyi sunmak, kuralları ve ödülleri hesaplamak, yasal yükümlülükleri (kimlik, yaptırımlar) yerine getirmek ve destek taleplerini yanıtlamak için." },
      { h: "Assistant", p: "ALPAS Assistant yalnızca kendi hesaplarınızdan yanıt için gereken verileri kullanır. Yardım içeriğini geliştirmek için sorular saklanabilir. Böyle bir sağlayıcı yapılandırılıp açıklanmadıkça kişisel veriler üçüncü taraf yapay zekâ sağlayıcılarına gönderilmez." },
      { h: "Sertifikalar", p: "Açık doğrulama sayfaları yalnızca sertifikadaki adı, programı, tutarı, tarihi ve durumu gösterir. E-posta ve bakiyeler asla gösterilmez." },
      { h: "Bu prototip", p: "Demo verileri yalnızca tarayıcınızın yerel depolamasında tutulur ve Demo verilerini sıfırla ile silinebilir." },
    ],
  },
  risk: {
    title: "Risk bildirimi",
    sections: [
      { h: "Simüle ortam", p: "ALPAS hesaplarındaki tüm işlemler simüledir. Sonuçlar; gerçekleşme, kayma ve likidite dahil canlı piyasalardan farklı olabilir." },
      { h: "Yatırım tavsiyesi değildir", p: "Bu sitedeki hiçbir şey yatırım tavsiyesi veya finansal hizmet teklifi değildir." },
      { h: "Ücret kaybedilebilir", p: "Değerlendirmelerin çoğu funded aşamaya ulaşmaz. Yalnızca kaybetmeyi göze alabileceğiniz bir ücreti ödemelisiniz." },
      { h: "Kaldıraç", p: "Simüle kaldıraç kazanç ve kayıpları büyütür ve bir zarar limitine hızla ulaşılmasına neden olabilir." },
    ],
  },
  refunds: {
    title: "İade politikası",
    sections: [
      { h: "İlk payout ile ücret iadesi", p: "Değerlendirme ücreti, Paid durumuna ulaşan ilk payout'unuza ayrı bir satır olarak bir kez eklenerek iade edilir. Kâr paylaşımına tabi değildir." },
      { h: "İşleme başlamadan önce", p: "Taslak yaklaşım: hesapta hiç pozisyon açılmamışsa, satın almadan sonraki 14 gün içinde talep üzerine ücret iade edilebilir. Bu, geçerli tüketici mevzuatına tabidir." },
      { h: "Başka iade yok", p: "İhlal, süresi dolan hesap veya reddedilen inceleme sonrasında ücret iade edilmez." },
      { h: "Bu prototip", p: "Prototipte ödeme alınmadığı için iade işlenmez." },
    ],
  },
};

export const legal = section({ en, tr });

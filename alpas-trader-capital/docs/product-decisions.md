# ALPAS taslak ürün kararları

> **Statü:** ALPAS taslak ürün kararı. Fiyatlar, limitler ve oranlar bir başlangıç önerisidir; hukuki inceleme, ödeme altyapısı, broker/teknoloji ortaklığı ve gerçek trader verisiyle risk modellemesi yapılmadan yayına alınmamalıdır. Bu belge şirketin finansal sürdürülebilirliğine dair bir iddia içermez.

Tek kaynak: `src/domain/catalog.ts`. Site, checkout, dashboard, kural motoru ve ALPAS Assistant bu dosyadaki tipli verileri kullanır; bu belge onun insan okunur özetidir.

## 1. Portföy

| Program | Kod | Model | Hesap büyüklükleri | Neden |
|---|---|---|---|---|
| **Ascent** | ASC | İki aşama | 10K, 25K, 50K, 100K, 200K | Pazarın en anlaşılır modeli; daha geniş limitler, static toplam zarar. |
| **Ridge** | RDG | Tek aşama | 10K, 25K, 50K, 100K | Hızlı değerlendirme isteyenler için; daha sıkı ve trailing limit, consistency ile dengelenir. 200K yok: tek aşamada ilk dönemde riski sınırlamak için. |

**Instant model eklenmedi.** Gerekçe: değerlendirme verisi olmadan fiyatlanması zor, ters seçim riski yüksek, kuralları (çok sıkı trailing + yüksek consistency) trader için anlaşılmaz hale geliyor. Gerçek değerlendirme verisi biriktikten sonra yeniden değerlendirilmeli.

## 2. Fiyatlar (USD, tek seferlik katılım ücreti)

| Büyüklük | Ascent | Ridge |
|---|---|---|
| 10K | $89 | $109 |
| 25K | $179 | $219 |
| 50K | $289 | $339 |
| 100K | $479 | $559 |
| 200K | $899 | — |

- Liste fiyatı sabittir; kalıcı "üstü çizili" fiyat yoktur.
- Kampanya yalnızca açık kodla uygulanır ve kodun yüzdesi, bitiş tarihi ve kapsamı checkout'ta gösterilir. Demo kod: `ASCENT10` (Ascent'te %10, katalogda bitiş tarihi tanımlı).
- **Program adları:** Programlar marka ön eki olmadan **Ascent** ve **Ridge** olarak adlandırılır; marka logo, site ve sertifikalarda zaten görünür.

### 2.1 "What is your budget?" — özel hesap büyüklüğü
Standart planların arasında bir büyüklük isteyen trader, **istediği hesap büyüklüğünü** (ör. $35.000) ya da **ayırmak istediği ücreti** girer.

| Konu | Karar |
|---|---|
| Aralık | Ascent $10K–$200K, Ridge $10K–$100K. Adım $5.000. |
| Fiyat | Komşu standart planlar arasındaki doğrusal fiyat eğrisi **+ %8**, yukarı yuvarlanmış tam dolar. Örnek: Ascent 35K → eğri $223 → **$241**. |
| Avantaj | Standart planların hacim avantajının biraz altında kalır (+%8 prim). |
| Kampanya kodu | Özel boyutta kodun oranının **%70'i** uygulanır (`ASCENT10`: standartta %10, özelde %7). |
| Daha iyi standart plan | Aynı veya daha büyük bir standart plan aynı/daha düşük ücretliyse açıkça önerilir (ör. özel 95K $497 → standart 100K $479). |
| Kurallar | Standart planlarla aynı kural sürümü. Yüzde bazlı limitler ve payout tutarları hesap büyüklüğüyle orantılıdır. |
| Ücret bütçesi modu | Girilen ücret bütçesine sığan en büyük plan (standart veya özel) bulunur. |

- **Kavram ayrımı (her ekranda):** *Simüle hesap büyüklüğü* çekilebilir para değildir. *Katılım ücreti* değerlendirme hizmetinin bedelidir. *Performans ödülü* funded aşamada simüle kârdan hesaplanan, trader'a ödenebilen tutardır.

## 3. Kurallar (kural sürümleri: Ascent v1.1, Ridge v1.0)

### Ortak tanımlar
| Konu | Karar |
|---|---|
| Günlük reset | **17:00 `America/New_York`** (FX gün kapanışı; swap da bu anda işlenir). Yaz/kış saati IANA kuralına göre izlenir. |
| İşlem günü | 17:00–17:00 NY aralığında **en az bir pozisyonun açıldığı** gün. |
| Kârlı gün | O işlem gününde kapanan işlemlerin net P&L'i (komisyon + swap dahil) > 0. |
| Günlük zarar referansı | Reset anındaki **bakiye ve equity'nin yüksek olanı**. Hesap gün ortasında açıldıysa başlangıç bakiyesi. |
| Günlük zarar tabanı | `referans − (günlük limit % × başlangıç büyüklüğü)` — tutar başlangıç büyüklüğüne göre sabittir. |
| Hesaba katılanlar | Equity = bakiye + açık P&L; açık P&L içinde komisyon ve birikmiş swap vardır. Komisyon pozisyon açılırken equity'ye yansır, kapanışta bakiyeye geçer. |
| Sınıra eşitlik | **Equity ≤ taban = ihlal** (sınıra dokunmak da ihlaldir). Hesap kapanır, açık pozisyonlar kapatılmış sayılır. |
| Inactivity | 30 ardışık takvim günü işlem açılmazsa hesap kapanır (23. günde uyarı). |
| Süre sınırı | Yok. |

### Ascent — iki aşama
| | Aşama 1 | Aşama 2 | Funded |
|---|---|---|---|
| Kâr hedefi | %8 | %5 | — |
| Günlük zarar | %5 | %5 | %5 |
| Toplam zarar | %10 **static** (taban = başlangıç × 0,90) | aynı | aynı |
| Min. işlem günü | 4 | 4 | Payout döngüsü başına 4 |
| Consistency | yok | yok | yok |
| Haber | serbest | serbest | Etkilenen enstrümanda yüksek etkili verinin ±2 dk'sı içinde açılış/kapanış yapılmaz; bu işlemlerin kârı payout'tan düşülür (ihlal değildir) |
| Hafta sonu | serbest | serbest | serbest (gap'ler limitlere sayılır) |

Aşama 1'i geçmek **funded hesap açmaz**; yeni bir Aşama 2 hesabı açılır. Aşama 2 hedefleri tamamlanınca hesap **incelemeye** alınır.

### Ridge — tek aşama
| | Değerlendirme | Funded |
|---|---|---|
| Kâr hedefi | %10 | — |
| Günlük zarar | %3 | %3 |
| Toplam zarar | %6 **end-of-day trailing** | aynı (funded'da sıfırdan başlar) |
| Min. işlem günü | 3 | Payout döngüsü başına 4 |
| Consistency | En iyi gün ≤ toplam kârın %50'si — **hedefin tamamlanmasını bekletir**, ihlal değildir | En iyi gün ≤ döngü kârının %40'ı — **payout'u bekletir** |
| İşlem başına risk | (Giriş − SL) × hacim ≤ başlangıcın %2'si; aşılırsa *yumuşak ihlal* kaydı; 3 kayıt → manuel inceleme | aynı |
| Haber | serbest | Ascent funded ile aynı |
| Hafta sonu | Cuma 16:50 NY'den sonra açık pozisyon kapatılır (ihlal değildir) | aynı |

**Trailing formülü:** `taban = min(başlangıç, HWM − %6 × başlangıç)`. `HWM` = reset anlarındaki en yüksek kapanış bakiyesi (başlangıç bakiyesinden başlar). Taban yalnızca yukarı hareket eder ve başlangıç bakiyesinde kilitlenir.
Örnek (100K): HWM 103.000 → taban 97.000. HWM 106.000 ve üstü → taban 100.000'de kilitli.

**Consistency formülü:** `pay = en iyi günün net P&L'i / toplam net kâr` (toplam > 0 ise). Örnek: toplam +$10.400, en iyi gün +$4.900 → %47,1 ≤ %50 ✓.

### Yasaklı uygulamalar (her iki program)
Gecikme arbitrajı, tick scalping / HFT (günde 2.000'den fazla sunucu isteği), hesaplar veya firmalar arası karşı pozisyon (hedge), demo fiyat hatalarını istismar, hesabın üçüncü kişiye kullandırılması veya üçüncü kişi tarafından yönetilmesi, consistency kuralını aşmak için kârı yapay olarak günlere bölmek.
**EA'lar** yukarıdakilere girmedikçe serbesttir. **Copy trading** yalnızca kişinin kendi ALPAS hesapları arasında yapılabilir; tüm hesapların toplam nominal büyüklüğü en fazla $400K olabilir.

## 4. Aşama geçişi
1. Hedefler sağlanır ve açık pozisyon kalmaz → sistem doğrulaması.
2. Aşama 1 (Ascent) → yeni Aşama 2 hesabı (yeni numara, aynı kural snapshot'ı).
3. Son aşama → **İnceleme** (hedef süre 1–2 iş günü). Kural ihlali, yumuşak ihlal sayısı, yasaklı uygulama kontrolleri yapılır. Gerekçeli onay veya ret verilir.
4. Onay → **Challenge Passed sertifikası** + demo KYC + demo trader sözleşmesi.
5. KYC doğrulandı ve sözleşme imzalandı → **funded hesap aktivasyonu** + **Funded Trader sertifikası**.

## 5. Payout
| Konu | Karar |
|---|---|
| Kâr payı | Trader %80 / ALPAS %20. Scaling ile %90 / %10. |
| İlk uygunluk | Funded hesaptaki ilk işlemden **14 gün** sonra (Ascent v1.0'da 21 gündü). |
| Sonraki döngü | Son ödenen payout talebinden 14 gün sonra. |
| Minimum talep | Nominal büyüklüğün %0,5'i, brüt (100K → $500). |
| Ön koşullar | KYC doğrulandı, sözleşme imzalandı, hesap aktif, açık pozisyon yok, döngüde ≥ 4 işlem günü, (Ridge) consistency ✓, bekleyen başka talep yok. |
| Ücret iadesi | Katılım ücreti ilk **Paid** payout'a ayrı satır olarak eklenir (kâr paylaşımına girmez). |
| Rezerv | Talep anında brüt tutar bakiyeden **rezerve edilir** (işlem yapılabilir bakiyeden çıkar). Ret veya iptalde bakiyeye geri döner. |
| Payout sonrası risk | Çekimler zarar sayılmaz: günlük referans ve (Ridge'de) HWM aynı tutar kadar aşağı kaydırılır. Ascent static tabanı değişmez. |
| Durumlar | Requested → Under Review → Approved → Processing → Paid; Rejected ve Cancelled terminal durumlardır. **Hiçbir talep otomatik olarak Paid olmaz.** |
| Hedef süreler | İnceleme 2 iş günü, ödeme işleme 3 iş günü (hedeftir, garanti değildir). |

## 6. Scaling
4 aylık dönem sonunda hesap şu koşulları sağlarsa nominal büyüklük %25 artar ve kâr payı %90'a çıkar:
- dönemde ≥ %10 net kâr,
- en az 2 Paid payout,
- hiç yumuşak ihlal kaydı olmaması.

Trader başına toplam nominal üst sınır $1M'dir.

## 7. Platform ve bölge
- **Platform:** Planlanan entegrasyonlar MetaTrader 5 ve cTrader'dır. Prototipte bağlantı **simüledir**; lisans veya ortaklık iddiası yoktur.
- **Bölge:** Yaptırım uygulanan veya yerel mevzuatın yasakladığı ülkelerde hizmet verilmez. Prototipteki liste (KP, IR, SY, CU) **örnektir**; nihai liste hukuk incelemesine bağlıdır.

## 8. Kural sürümü ve snapshot
- Her satın alma, o anki kural setinin tam kopyasını (`ruleSnapshot`) challenge'a bağlar. Yeni sürüm yayımlanması eski hesapları değiştirmez.
- Örnek senaryo: Ascent v1.0'da (2026-08-01) min. işlem günü 5, ilk payout 21 gündü. v1.1'de (2026-10-15) bunlar 4 gün ve 14 gün oldu. Demo'daki funded hesap v1.0 kurallarıyla devam eder ve Assistant bu farkı açıkça belirtir.

## 9. Sertifikalar
| Tür | Üretim koşulu |
|---|---|
| Challenge Passed | Tüm değerlendirme aşamaları ve inceleme onaylandığında |
| Funded Trader | KYC + sözleşme tamamlanıp funded hesap aktive olduğunda |
| Payout | Yalnızca payout **Paid** olduğunda |

Her sertifikanın bir kaydı (numara, doğrulama kodu, durum: geçerli/iptal) vardır. QR, minimum bilgi gösteren `/verify/<numara>` sayfasına gider (e-posta veya hesap bakiyesi gösterilmez).

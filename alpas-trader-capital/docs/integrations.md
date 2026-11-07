# Gerçek servis entegrasyonları

Prototip, aşağıdaki noktalarda gerçek servis yerine **demo adaptörü** kullanır. Her maddede prototipteki yer, üretimde gereken servis ve dikkat edilmesi gerekenler yazılıdır. Hiçbirinde gerçek veri toplanmaz, gerçek para hareket etmez.

| # | Alan | Prototipteki yer | Üretimde gereken |
|---|---|---|---|
| 1 | **Kimlik doğrulama ve yetki** | `services/actions.ts` → `registerUser`, `loginUser` (FNV tabanlı demo hash). Oturum `localStorage`'da tutulur. | Sunucu tarafı oturum veya OIDC (ör. Auth0, Cognito, Keycloak), parola hash'i (argon2id), 2FA (TOTP/WebAuthn), oturum yönetimi. **Tüm `ops*` fonksiyonları ve `requestPayout` gibi işlemler sunucuda, oturumdaki role göre yetkilendirilmeli.** Demo rol geçişi kaldırılmalı. |
| 2 | **Veri tabanı ve kalıcılık** | `lib/store.tsx` (localStorage) + saf servis fonksiyonları | PostgreSQL vb. `DemoState` tabloları (users, orders, challenges, accounts, trades, ledger, payouts, certificates, audit…). Servis fonksiyonları zaten saftır; API route/Server Action içinde transaction ile çalıştırılabilir. Audit log değiştirilemez (append-only) bir depoda tutulmalı. |
| 3 | **Değerlendirme ücreti ödemesi** | `purchaseChallenge` (status `paid_demo`), checkout adım 3–4 | Ödeme kuruluşu (PSP) ve barındırılan ödeme sayfası (kart verisi uygulamaya hiç gelmemeli, PCI kapsamı dışarıda kalmalı). Webhook ile sipariş onayı ve idempotency anahtarı. KDV/vergi faturası için muhasebe entegrasyonu. Promosyon kodları sunucuda doğrulanmalı. |
| 4 | **KYC** | `submitKyc` / `opsDecideKyc` (belge yüklenmez) | KYC/AML sağlayıcısı (belge + canlılık + yaptırım/PEP taraması). Sonuç webhook ile `user.kyc` alanını güncellemeli. Belgeler uygulama veritabanında tutulmamalı. |
| 5 | **Trader sözleşmesi** | `signContract` (yazılan ad doğrulanır) | E-imza servisi ve hukuk ekibince onaylı sözleşme metni (`CONTRACT_VERSION`). İmzalı PDF arşivlenmeli. |
| 6 | **İşlem platformu / broker teknolojisi** | `services/simulate.ts` (sentetik fiyatlar), hesap giriş bilgileri yer tutucu | MT5 / cTrader / benzeri bir platformla lisans veya teknoloji ortaklığı: hesap açma, işlem akışı, gerçek zamanlı equity. **Risk motoru (`domain/risk.ts`) şu an gün içi equity'yi işlemlerin MAE değerinden yeniden kurar.** Üretimde equity snapshot akışı (tick veya en az saniyelik) motorun `EquityPoint` girdisine bağlanmalı. İhlal anında pozisyonları kapatma platform API'si ile yapılmalı. |
| 7 | **Ekonomik takvim** | `Trade.newsWindow` simüle bayrak | Yüksek etkili veri takvimi sağlayıcısı ve enstrüman eşlemesi. ±2 dk penceresinin otomatik işaretlenmesi. |
| 8 | **Payout ödeme kanalı** | `PAYOUT_METHODS` (yer tutucu), `opsTransitionPayout` | Banka transferi / stablecoin ödeme sağlayıcısı, alıcı doğrulama, yaptırım taraması, vergi belgeleri. "Paid" durumu yalnızca ödeme sağlayıcısının onay webhook'u ile verilmeli. Rezerv ve ledger kayıtları veritabanında transaction ile yazılmalı. |
| 9 | **E-posta** | `domain/emails.ts` (örnek gösterim) | Transactional e-posta servisi (SPF/DKIM/DMARC). Şablonlar hazırdır, aynı olay ve parametrelerden üretilir. |
| 10 | **Sertifika kaydı ve doğrulama** | Kayıt tarayıcıda, kod FNV ile türetiliyor | Sunucu tarafı kayıt + herkese açık doğrulama API'si. Doğrulama kodu sunucuda gizli anahtarla imzalanmalı (HMAC/Ed25519). QR adresi üretim alan adına işaret etmeli. İptal kayıtları kalıcı olmalı. |
| 11 | **ALPAS Assistant (LLM)** | `server/llm.ts` (Anthropic SDK adaptörü), `server/rewrite-guard.ts` | `ANTHROPIC_API_KEY` ve model ayarları (`.env.example`). Üretimde yetkili bağlam (`buildAssistantContext`) **sunucuda, oturumdan** kurulmalı. Prototipte bağlamı tarayıcı kurar ve sunucuya yalnızca hazırlanmış taslak gider. Kalıcı rate limit (Redis vb.), PII'siz loglama ve bilgi tabanı içerik onayı eklenmeli. |
| 12 | **Destek masası** | `tickets` (yerel) | Helpdesk entegrasyonu (ticket oluşturma, yanıt webhook'u). |
| 13 | **İzleme ve analitik** | — | Hata izleme, performans izleme, gizlilik uyumlu ürün analitiği. |
| 14 | **Hukuk ve lisans** | Taslak metinler (`/legal/*`) | Tüzel kişilik, ülke bazlı lisans/izin analizi, nihai yasaklı ülke listesi (`RESTRICTED_COUNTRIES` şu an örnektir), tüketici hukuku (iade), KVKK/GDPR. |

## Güvenlik notları
- Demo modunda `localStorage` yalnızca demo verisi içindir ve bir güvenlik mekanizması değildir. Kullanıcı tarafından değiştirilebilir.
- Ops işlemleri prototipte yalnızca `actor.role === "ops"` kontrolüyle korunur. Gerçek backend'de bu kontrol sunucu tarafında, doğrulanmış oturumla yapılmalıdır.
- `/api/assistant` route'u gövde boyutunu (64 KB), şemayı (zod) ve istek sıklığını (örnek başına bellek içi) sınırlar. Ret yanıtları hiçbir zaman LLM'e gönderilmez.

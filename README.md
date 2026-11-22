# OverPath

**[▶ Tarayıcıda aç: ftc-29304.github.io/OverPath](https://ftc-29304.github.io/OverPath/)** (kurulum gerekmez)

FTC için otonom planlayıcı ve Java kod üretici. Otonomu sahanın üzerine çizersin, OverPath robotun çalıştıracağı Java kodunu yazar.

İki modu var. Üst çubuktaki **Enkoder yolları / Zaman tabanlı** düğmesiyle geçiş yapılır:

- **OverPath**: Tekerlek enkoderleri ve Control Hub'ın içindeki IMU ile robotun sahadaki yerini takip eder.
- **OverTime**: Enkoder gerekmez. Süre, güç ve IMU ile sürer.

İkisi de BIOBUZZ (2026-27) sahası ve kurallarıyla gelir. Arayüz Türkçe ve İngilizce.

## Neden OverPath?

FTC'de iyi bir otonom genelde odometri donanımı ister. OverPath ise robotta zaten olan donanımla güvenilir bir otonom çıkarmak için var. OverTime da enkoderlerin hiç kullanılamadığı durumlar için: örneğin enkoder kablosu takılamıyorsa ya da enkoder sinyali Control Hub'a uymuyorsa.

## OverPath mi, OverTime mı?

| | OverPath | OverTime |
|---|---|---|
| Neyle ölçer | Tekerlek enkoderleri + IMU | Süre + IMU |
| Gereken | Çalışan sürüş enkoderleri | Sadece Control Hub |
| Konum | Robot kendi yerini sürekli hesaplar; bir hareketteki hatayı bir sonrakinde düzeltir | Mesafe süreden hesaplanır, robot yerini bilmez |
| Duvar | Duvara değdiğini kendisi anlar ve konumunu sıfırlar | Duvara belirli bir süre yaslanır |
| Pil | Motorların hız kontrolü pil düşüşünü telafi eder | Güç, pil voltajına göre ölçeklenir |
| Sürüş sistemi | Mecanum ve tank | Mecanum |
| Hassasiyet | Daha yüksek | Daha düşük, kalibrasyona ve zemine bağlı |

Kısacası: enkoderler çalışıyorsa **OverPath**, çalışmıyorsa **OverTime**.

## Diğer path planner'lardan farkı

Diğer path planner'lar odometri ister, OverPath istemez. Robottaki sürüş motorları ve Control Hub yeterli.

OverPath'e özel olanlar:

- **Hata önizlemesi:** Her hedef noktanın etrafında robotun gerçekte durabileceği alan çizilir. Otonom 300 kez simüle edilir; park etme ve HIVE'a çarpma ihtimalleri yazılır.
- **Duvarla sıfırlama:** Robot duvara yavaşça yaslanınca o eksendeki hatası sıfırlanır. **Doğruluk için iyileştir** düğmesi en faydalı duvar temaslarını kendisi önerir.
- **Otomatik kalibrasyon:** Kalibrasyon OpMode'u robotun sayılarını kendisi ölçer. Tekrarlanabilirlik için mezura gerekmez, duvar cetvel görevi görür.
- **Gerçek koşulardan öğrenme:** Her otonom robotta bir kayıt bırakır. Kaydı planlayıcıya yükleyince robotun gerçekte ne yaptığı sahada görünür. Duvar temaslarından aşınmış tekerlek gibi sabit hatalar bulunur ve düzeltme önerilir.
- **Kural kontrolü:** BIOBUZZ başlangıç kuralları, HIVE, FLOWER'lar, rakip taraf, LEAVE/PARK ve 30 saniye sınırı.

## Faydaları

- **Ek donanım yok:** Robotta zaten olan motorlar ve Control Hub yeterli.
- **Kodu planlayıcı yazar:** Senin motor ve servo isimlerinle, okunabilir Java üretir. Robot tarafı tek dosya (`OverPath.java` ya da `OverTime.java`), başka kütüphane gerekmez.
- **Hızlı deneme:** Yolu sürükle, zaman çizelgesinde oynat, hataları robotu sahaya koymadan gör.
- **Çevrimdışı çalışır:** Bir kez açıldıktan sonra internet olmadan da açılır (yarışmada robotun Wi-Fi'ına bağlıyken işe yarar). Her şey tek dosyaya yedeklenip başka bilgisayarda geri yüklenebilir.

## Ne gerekir?

**Robot:**
- REV Control Hub (içindeki IMU kullanılır)
- FTC SDK 8.1 veya üstü
- Android Studio
- **OverPath için:** sürüş motorlarında çalışan enkoderler. Motorun tur başına tik sayısı, dişli oranı ve teker çapı da gerekir.
- **OverTime için:** mecanum sürüş, kalibrasyon için mezura ve dolu bir pil.

**Bilgisayar:**
- Node.js 20.19+ (ya da 22.12+)
- Güncel bir tarayıcı

## Kurulum

```bash
npm install
npm run dev
```

Terminalde yazan adresi tarayıcıda aç.

## Web sitesi (GitHub Pages)

OverPath hiçbir şey kurmadan, GitHub Pages üzerinden tarayıcıda da çalışır: [ftc-29304.github.io/OverPath](https://ftc-29304.github.io/OverPath/). `main` dalına her gönderimde site kendisi güncellenir: testler çalışır, site derlenir ve yayınlanır (`.github/workflows/pages.yml`).

Siteyi açmak için:
1. Repo'da **Settings → Pages → Source** kısmından **GitHub Actions**'ı seç.
2. `main` dalına gönder ya da **Actions → Publish site → Run workflow**'a bas.
3. Site `https://<kullanıcı-adı>.github.io/<repo-adı>/` adresinde açılır.

Bilmen gerekenler:
- Yapılan işler tarayıcıda, her site için ayrı saklanır. Başka bir bilgisayara ya da siteye taşımak için **Ayarlar → Yedeği indir** ve **Yedeği geri yükle** kullanılır.
- Site https olduğu için **Robottan al** düğmesi robota doğrudan bağlanamaz. Dosyayı robotun Wi-Fi'ında `http://192.168.43.1:10159` adresinden indirip planlayıcıya yükle.

## Kullanım

### OverPath

1. **Ayarlar → Sürüş ve IMU**: Kodundaki motor ve IMU isimlerini gir.
2. **Java kodu** sekmesinden `OverPath.java`'yı indir ve `TeamCode/.../overpath/` klasörüne koy.
3. **Kalibrasyon OpMode'unu** indir ve robotta çalıştır:
   - **dpad sol**: tekerlek yönleri
   - **sol bumper**: otomatik ayar
   - **sağ bumper**: duvar testleri
   - Robotun Wi-Fi'ında `http://192.168.43.1:10159` adresinden `calibration.json`'u indir ve **Ayarlar → Sabitler → Robottan içe aktar**'dan yükle.
4. Otonomu sahaya çiz. Kural kontrolüne ve hata alanlarına bak. Skor noktasından önce bir duvar teması ekle.
5. **Java kodu** sekmesinden kodu kopyala ya da indir.
6. Maçtan sonra koşu kaydını **Yol → Gerçek koşular**'a yükle.

İlk açılışta gelen **Buradan başla** rehberi bu adımları tek tek gösterir.

### OverTime

1. **Ayarlar → Donanım**: Motor isimlerini, ters dönen motorları ve hub yönünü gir.
2. `OverTimeCalibration.java`'yı indir. Robotu yarışma zemininde, dolu pille çalıştır:
   - **A / B**: 1 sn ve 2 sn ileri sürüş
   - **X / Y**: 1 sn ve 2 sn sola kayma
   - **dpad yukarı**: dönüş testi
3. Her sürüşü mezurayla ölç ve sonuçları **Ayarlar → Kalibrasyon**'a gir.
4. Otonomu sahaya çiz ya da adım listesinden düzenle.
5. **Java kodu** sekmesinden otonomu ve `OverTime.java`'yı indir.

Kalibrasyon değişince otonomları yeniden indir, çünkü sayılar üretilen dosyanın içinde.

**Sürerken başka iş yapmak (örneğin intake):** Motor ya da Komut adımında **Beklemeden devam et**'i işaretle. Adım çalışır ve otonom hemen sonraki adıma geçer. Süre bitince motor kendisi durur ya da seçilen komut (örneğin `intake off`) çalışır, sürüşün ortasında olsa bile. Zaman çizelgesinde bu adımlar ikinci satırda görünür. Bunun için robotta OverTime.java 1.3.0 veya daha yenisi olmalı.

**Daha önce yazılmış bir otonomu eklemek:** **Java kodu → Düzenle / Java içe aktar**'a bas. Kodu yapıştır ya da **Dosya aç…** ile `.java` dosyasını seç, sonra **Yeni otonom olarak ekle** ya da **Bu otonoma uygula**'ya bas. Adımlar, otonomun adı ve başlangıç yönü koddan okunur. Anlaşılamayan satırlar numaralarıyla listelenir. Başlangıç konumu (x, y) kodda olmadığı için sahada ayarlanır.

## Testler

```bash
npm test           # planlayıcı testleri
npm run test:java  # Java kodunu FTC SDK taklitleriyle derler, simüle robotta dener
npm run lint
npm run build
```

`npm run test:java` robot olmadan çalışır. Bir fizik simülasyonunda şunlar denenir:
- tekerlek kayması
- duvar temasları
- engellenme
- IMU arızası
- otomatik kalibrasyon

## Bilinmesi gerekenler

- Buradaki isabet sayıları simülasyondan geliyor. Gerçek robotta henüz ölçülmedi. Aynı otonomu 10 kez çalıştırıp durduğu yeri mezurayla ölçmek gerçek sonucu verir.
- Enkoderler başka bir robotun itmesini hissedemez. Robotun önü kesilirse fark eder ve o adımı atlar.
- OverPath'in zayıf noktası çok kaygan zemin: duruşta hedefi biraz geçebiliyor.
- OverTime'da mesafeler tahmindir, isabet kalibrasyona ve zemine bağlıdır.

## Yapımcılar

OverPath, **FRC 9483 Overcharge yazılım ekibi** tarafından geliştirildi.

## Lisans

MIT lisansı. Herkes kullanabilir, değiştirebilir ve paylaşabilir; tek şart, lisans ve telif satırının kopyalarda kalması. Ayrıntılar [LICENSE](LICENSE) dosyasında.

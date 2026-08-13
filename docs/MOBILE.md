# Mobile — Aplicativo Android (Capacitor)

O app Android empacota o mesmo código React da web (`apps/web`) via Capacitor 8.
Não há código nativo além do wrapper.

## Como funciona

1. `npm run build --workspace apps/web` gera o bundle em `apps/web/dist`.
2. `cap sync android` copia o bundle e os plugins nativos para `apps/android/android`.
3. `gradlew assembleDebug` compila o APK.

A página inicial do app é a área do jogador (`/jogador/:id`); o webview
mantém o mesmo comportamento do site.

## Requisitos de build

| Item | Exigência |
|------|-----------|
| JDK | 21 (Temurin/Eclipse Adoptium), `JAVA_HOME` definido |
| Android SDK | `ANDROID_HOME`/`local.properties` (`sdk.dir`) com platform + build-tools |
| Espaço | ~2–3 GB livres (Gradle baixa dependências no 1º build) |
| Gradle | Wrapper incluído (`gradlew`) |

## Configuração atual

- `appId`: `br.com.hudplay.app`
- `appName`: `Hudplay`
- `webDir`: `../../apps/web/dist` (bundle do SPA)
- `androidScheme`: `https` (interceptação segura; cleartext desativado)
- Plugins: `@capacitor/app`, `@capacitor/push-notifications`, `@capacitor/status-bar`

## API base do app

O webview chama a mesma `VITE_API_URL` do SPA. Em produção, aponte para o backend
publicado (ex.: `https://hudplay-api.up.railway.app`). Para build local, use a
máquina na mesma rede ou um túnel (ex.: ngrok).

## Gerar APK

```bash
npm run build --workspace apps/web
npm run sync --workspace apps/android
npm run build:apk --workspace apps/android
# apps/android/android/app/build/outputs/apk/debug/app-debug.apk
```

### APK de produção (assinado)

1. Gere um keystore (guarde em local seguro, **nunca commite**):
   ```bash
   keytool -genkey -v -keystore hudplay-release.jks -keyalg RSA -keysize 2048 \
     -validity 10000 -alias hudplay
   ```
2. No `apps/android/android/app/build.gradle`, configure `signingConfigs.release`
   (apontando para o keystore) e use-o no `buildTypes.release`.
3. `npm run build:apk --workspace apps/android` com `--release` no Gradle, ou rode:
   ```bash
   cd apps/android/android && ./gradlew assembleRelease
   ```

## Notificações push

O plugin `@capacitor/push-notifications` está instalado. Para notificações reais é
necessário um serviço de push (ex.: FCM) — consulte `docs/SECURITY.md` e a doc do
plugin. O backend já grava notificações em banco (`notifications`) para exibição
in-app enquanto o push externo não é configurado.

## Ícones e splash

Assets em `apps/android/android/app/src/main/res/`. Para trocar o ícone, substitua
as mipmaps e o drawable, depois rode `npm run sync --workspace apps/android`.
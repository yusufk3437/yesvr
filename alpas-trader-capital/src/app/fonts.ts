import localFont from "next/font/local";

export const archivo = localFont({
  src: [
    { path: "../../public/fonts/Archivo_600SemiBold.ttf", weight: "600" },
    { path: "../../public/fonts/Archivo_700Bold.ttf", weight: "700" },
    { path: "../../public/fonts/Archivo_800ExtraBold.ttf", weight: "800" },
  ],
  variable: "--font-archivo",
  display: "swap",
});

export const plex = localFont({
  src: [
    { path: "../../public/fonts/IBMPlexSans_400Regular.ttf", weight: "400" },
    { path: "../../public/fonts/IBMPlexSans_400Regular_Italic.ttf", weight: "400", style: "italic" },
    { path: "../../public/fonts/IBMPlexSans_500Medium.ttf", weight: "500" },
    { path: "../../public/fonts/IBMPlexSans_600SemiBold.ttf", weight: "600" },
  ],
  variable: "--font-plex",
  display: "swap",
});

export const plexMono = localFont({
  src: [
    { path: "../../public/fonts/IBMPlexMono_400Regular.ttf", weight: "400" },
    { path: "../../public/fonts/IBMPlexMono_500Medium.ttf", weight: "500" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

export const newsreader = localFont({
  src: [
    { path: "../../public/fonts/Newsreader_400Regular.ttf", weight: "400" },
    { path: "../../public/fonts/Newsreader_400Regular_Italic.ttf", weight: "400", style: "italic" },
    { path: "../../public/fonts/Newsreader_600SemiBold.ttf", weight: "600" },
  ],
  variable: "--font-newsreader",
  display: "swap",
});

// Ported from getpaseo/paseo (Apache-2.0)
import * as Linking from "expo-linking";
import { isWeb } from "@/constants/platform";

import { isHttpUrl } from "./http-url";

export async function openExternalUrl(url: string): Promise<void> {
  if (!isHttpUrl(url)) return;
  // [pie] desktop-host bridge not ported yet (Electron shell unpinned);
  // the plain web fallback below is the shipping path until that lands.
  if (isWeb) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  await Linking.openURL(url);
}

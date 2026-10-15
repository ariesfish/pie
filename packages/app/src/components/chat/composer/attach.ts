// [pie] W4 attach platform dispatcher. NOTE: unlike the identical-shaped
// hubs (file-pane/editor/view.tsx, layout/split-dnd-shell.ts) where metro's
// web platform resolves the unsuffixed import straight to the .web module,
// this hub's import oddly resolved through the hub itself in web bundles
// (expo-image-picker shipped along). Rather than fight the resolver, the
// hub dispatches via a Platform constant — dead code either way, zero
// runtime ambiguity. Follow-up: metro.config investigation (see NOTICE).
import { Platform } from "react-native";

import { AttachStrip as NativeStrip, AttachButton as NativeAttacher } from "./attach.native";
import { AttachStrip as WebStrip, AttachButton as WebAttacher } from "./attach.web";

export const AttachStrip = Platform.OS === "web" ? WebStrip : NativeStrip;
export const AttachButton = Platform.OS === "web" ? WebAttacher : NativeAttacher;
export type { ComposerAttachment } from "./attach.traits";

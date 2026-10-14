// Ported from getpaseo/paseo (Apache-2.0)
import { BottomSheetBackdrop, type BottomSheetBackdropProps } from "@gorhom/bottom-sheet";

export function SheetBackdrop(props: BottomSheetBackdropProps & { opacity?: number }) {
  return <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />;
}

// [pie] W4c-2/W4d web image attach surfaces. JSX DOM tags don't render
// under RN-web's jsx runtime, so the file input is a real DOM element
// created imperatively on press (web-only module); thumbnails use RN
// Image with data-URL sources like the native face.
import { useCallback, useRef } from "react";
import { Image, Pressable, View } from "react-native";
import { ImagePlus, X } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";

import type { ComposerAttachment } from "./attach.traits";

export type { ComposerAttachment } from "./attach.traits";

export function AttachStrip(props: {
	images: ComposerAttachment[];
	onRemove(index: number): void;
	label: string;
}) {
	if (props.images.length === 0) return null;
	return (
		<View style={styles.imageStrip}>
			{props.images.map((img, i) => (
				<View key={`${i}:${img.preview.slice(-24)}`} style={styles.thumbWrap}>
					<Image source={{ uri: img.preview }} style={styles.thumbImg} />
					<Pressable
						style={styles.thumbRemove}
						accessibilityLabel={props.label}
						onPress={() => props.onRemove(i)}
					>
						<X size={10} color="#ffffff" strokeWidth={2} />
					</Pressable>
				</View>
			))}
		</View>
	);
}

export function AttachButton(props: {
	label: string;
	onAttach(list: ComposerAttachment[]): void;
}) {
	const pickerRef = useRef<HTMLInputElement | null>(null);

	const openPicker = useCallback(() => {
		if (pickerRef.current) {
			pickerRef.current.value = "";
			pickerRef.current.click();
			return;
		}
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "image/*";
		input.multiple = true;
		input.style.display = "none";
		input.addEventListener("change", () => {
			const files = input.files;
			if (!files || files.length === 0) return;
			const incoming = Array.from(files).filter((f) => f.type.startsWith("image/"));
			void Promise.all(
				incoming.map(
					(f) =>
						new Promise<ComposerAttachment | null>((resolve) => {
							const reader = new FileReader();
							reader.onload = () => {
								const url = typeof reader.result === "string" ? reader.result : null;
								if (!url) return resolve(null);
								resolve({
									data: url.slice(url.indexOf(",") + 1),
									mimeType: f.type,
									preview: url,
								});
							};
							reader.onerror = () => resolve(null);
							reader.readAsDataURL(f);
						}),
				),
			).then((loaded) => {
				props.onAttach(loaded.filter((x): x is ComposerAttachment => x != null));
			});
		});
		document.body.appendChild(input);
		pickerRef.current = input;
		input.click();
	}, [props]);

	return (
		<Pressable
			style={styles.attachBtn}
			accessibilityLabel={props.label}
			onPress={openPicker}
		>
			<ImagePlus size={16} color="#8b93a7" strokeWidth={1.5} />
		</Pressable>
	);
}

const styles = StyleSheet.create((theme) => ({
	imageStrip: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: theme.spacing[2],
		paddingHorizontal: theme.spacing[3],
		paddingTop: theme.spacing[2],
	},
	thumbWrap: {
		position: "relative",
		borderRadius: 8,
		overflow: "hidden",
		borderWidth: 1,
		borderColor: theme.colors.border,
	},
	thumbImg: { width: 64, height: 64 },
	thumbRemove: {
		position: "absolute",
		top: 3,
		right: 3,
		width: 16,
		height: 16,
		borderRadius: 8,
		backgroundColor: "rgba(0,0,0,0.65)",
		alignItems: "center",
		justifyContent: "center",
	},
	attachBtn: {
		alignSelf: "flex-end",
		padding: theme.spacing[2],
		borderRadius: 8,
		borderWidth: 1,
		borderColor: theme.colors.border,
		marginBottom: theme.spacing[1],
	},
}));

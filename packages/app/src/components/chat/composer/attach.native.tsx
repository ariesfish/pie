// [pie] W4d native image attach surfaces: expo-image-picker flow
// (permission gate + multi-select library) and RN Image thumbnails.
import { useRef } from "react";
import { Alert, Image, Pressable, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
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
	const [permission, requestPermission] = ImagePicker.useMediaLibraryPermissions();
	const pickingRef = useRef(false);

	const pick = async () => {
		if (pickingRef.current) return;
		pickingRef.current = true;
		try {
			let perm = permission;
			if (!perm || perm.status === ImagePicker.PermissionStatus.UNDETERMINED || !perm.granted) {
				perm = await requestPermission();
			}
			if (!perm?.granted) {
				Alert.alert("Photos access needed", "Allow photo library access to attach images.");
				return;
			}
			const result = await ImagePicker.launchImageLibraryAsync({
				mediaTypes: ["images"],
				allowsMultipleSelection: true,
				quality: 0.8,
				base64: true,
			});
			if (result.canceled) return;
			const attachments: ComposerAttachment[] = [];
			for (const asset of result.assets) {
				if (!asset.base64) continue;
				const mimeType = asset.mimeType ?? "image/jpeg";
				attachments.push({
					data: asset.base64,
					mimeType,
					preview: `data:${mimeType};base64,${asset.base64}`,
				});
			}
			if (attachments.length > 0) props.onAttach(attachments);
		} finally {
			pickingRef.current = false;
		}
	};

	return (
		<Pressable style={styles.attachBtn} accessibilityLabel={props.label} onPress={() => void pick()}>
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

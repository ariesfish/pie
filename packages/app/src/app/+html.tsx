// Expo-router custom HTML shell for web. RN Web needs an explicit height
// chain (html -> body -> #root) or every flex:1 view collapses to 0px and
// the transparent body shows the window's default white floor.
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta httpEquiv="X-UA-Compatible" content="IE=edge" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
					<ScrollViewStyleReset />
				<style
					// The floor under the whole app: height chain + dark canvas.
					// Keep in sync with styles/theme.ts darkTheme surface0.
					dangerouslySetInnerHTML={{
						__html: `html, body, #root { height: 100%; margin: 0; background: #101216; }`,
					}}
				/>
			</head>
			<body>{children}</body>
		</html>
	);
}

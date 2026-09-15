import { Button, Heading, Link, Text } from "react-email";
import { appHost } from "@shared/app";
import { PREVIEW_APP_URL } from "./preview";
import { EmailLayout } from "./layout";
import { bodyTextStyle, buttonStyle, colors, fallbackLinkTextStyle, headingStyle } from "./theme";

export function MagicLinkEmail({ url, appUrl }: { url: string; appUrl: string }) {
  return (
    <EmailLayout preview={`Your sign-in link for ${appHost(appUrl)}`} appUrl={appUrl}>
      <Heading as="h1" style={headingStyle}>
        Sign in to {appHost(appUrl)}
      </Heading>
      <Text style={bodyTextStyle}>Click the button below to sign in. This link expires in 5 minutes.</Text>
      <Button href={url} style={buttonStyle}>
        Sign in
      </Button>
      <Text style={fallbackLinkTextStyle}>
        Or paste this link into your browser:{" "}
        <Link href={url} style={{ color: colors.primaryInk }}>
          {url}
        </Link>
      </Text>
    </EmailLayout>
  );
}

MagicLinkEmail.PreviewProps = {
  url: `${PREVIEW_APP_URL}/api/auth/magic-link/verify?token=example-token`,
  appUrl: PREVIEW_APP_URL,
};

export default MagicLinkEmail;

import { Button, Heading, Link, Text } from "react-email";
import { APP_HOST, APP_URL } from "@shared/app";
import { EmailLayout } from "./layout";
import { bodyTextStyle, buttonStyle, colors, fallbackLinkTextStyle, headingStyle } from "./theme";

export function MagicLinkEmail({ url }: { url: string }) {
  return (
    <EmailLayout preview={`Your sign-in link for ${APP_HOST}`}>
      <Heading as="h1" style={headingStyle}>
        Sign in to {APP_HOST}
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
  url: `${APP_URL}/api/auth/magic-link/verify?token=example-token`,
};

export default MagicLinkEmail;

import { Button, Heading, Link, Text } from "react-email";
import { appHost } from "@shared/app";
import { PREVIEW_APP_URL } from "./preview";
import { EmailLayout } from "./layout";
import { bodyTextStyle, buttonStyle, colors, fallbackLinkTextStyle, headingStyle } from "./theme";

export function VerifyEmailEmail({ url, appUrl }: { url: string; appUrl: string }) {
  return (
    <EmailLayout preview={`Verify your ${appHost(appUrl)} email`} appUrl={appUrl}>
      <Heading as="h1" style={headingStyle}>
        Verify your email
      </Heading>
      <Text style={bodyTextStyle}>
        Click the button below to confirm this is your address and finish creating your account.
      </Text>
      <Button href={url} style={buttonStyle}>
        Verify email
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

VerifyEmailEmail.PreviewProps = {
  url: `${PREVIEW_APP_URL}/api/auth/verify-email?token=example-token&callbackURL=%2F`,
  appUrl: PREVIEW_APP_URL,
};

export default VerifyEmailEmail;

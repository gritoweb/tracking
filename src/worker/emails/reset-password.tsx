import { Button, Heading, Link, Text } from "react-email";
import { appHost } from "@shared/app";
import { PREVIEW_APP_URL } from "./preview";
import { EmailLayout } from "./layout";
import { bodyTextStyle, buttonStyle, colors, fallbackLinkTextStyle, headingStyle } from "./theme";

export function ResetPasswordEmail({ url, appUrl }: { url: string; appUrl: string }) {
  return (
    <EmailLayout preview={`Reset your ${appHost(appUrl)} password`} appUrl={appUrl}>
      <Heading as="h1" style={headingStyle}>
        Reset your password
      </Heading>
      <Text style={bodyTextStyle}>
        Click the button below to choose a new password. This link expires in 1 hour. If you
        didn't request this, you can ignore this email.
      </Text>
      <Button href={url} style={buttonStyle}>
        Reset password
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

ResetPasswordEmail.PreviewProps = {
  url: `${PREVIEW_APP_URL}/reset-password/example-token?callbackURL=%2Freset-password`,
  appUrl: PREVIEW_APP_URL,
};

export default ResetPasswordEmail;

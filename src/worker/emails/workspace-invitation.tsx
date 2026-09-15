import { Button, Heading, Link, Text } from "react-email";
import { appHost } from "@shared/app";
import { PREVIEW_APP_URL } from "./preview";
import { EmailLayout } from "./layout";
import { bodyTextStyle, buttonStyle, colors, fallbackLinkTextStyle, headingStyle } from "./theme";

export function WorkspaceInvitationEmail({
  inviterName,
  workspaceName,
  url,
  appUrl,
}: {
  inviterName: string;
  workspaceName: string;
  url: string;
  appUrl: string;
}) {
  return (
    <EmailLayout preview={`${inviterName} invited you to join ${workspaceName} on ${appHost(appUrl)}`} appUrl={appUrl}>
      <Heading as="h1" style={headingStyle}>
        Join {workspaceName}
      </Heading>
      <Text style={bodyTextStyle}>
        <strong>{inviterName}</strong> invited you to join the &quot;{workspaceName}&quot; workspace on
        {appHost(appUrl)}.
      </Text>
      <Button href={url} style={buttonStyle}>
        Accept invitation
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

WorkspaceInvitationEmail.PreviewProps = {
  inviterName: "Blake Bauman",
  workspaceName: "Blake's Workspace",
  url: `${PREVIEW_APP_URL}/accept-invite?id=example-invite-id`,
  appUrl: PREVIEW_APP_URL,
};

export default WorkspaceInvitationEmail;

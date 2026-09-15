import { Button, Heading, Link, Text } from "react-email";
import { APP_HOST, APP_URL } from "@shared/app";
import { EmailLayout } from "./layout";
import { bodyTextStyle, buttonStyle, colors, fallbackLinkTextStyle, headingStyle } from "./theme";

export function WorkspaceInvitationEmail({
  inviterName,
  workspaceName,
  url,
}: {
  inviterName: string;
  workspaceName: string;
  url: string;
}) {
  return (
    <EmailLayout preview={`${inviterName} invited you to join ${workspaceName} on ${APP_HOST}`}>
      <Heading as="h1" style={headingStyle}>
        Join {workspaceName}
      </Heading>
      <Text style={bodyTextStyle}>
        <strong>{inviterName}</strong> invited you to join the &quot;{workspaceName}&quot; workspace on
        {APP_HOST}.
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
  url: `${APP_URL}/accept-invite?id=example-invite-id`,
};

export default WorkspaceInvitationEmail;

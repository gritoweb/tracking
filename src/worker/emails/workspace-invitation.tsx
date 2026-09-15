import { Button, Heading, Link, Text } from "react-email";
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
    <EmailLayout preview={`${inviterName} invited you to join ${workspaceName} on tracking.gritoweb.com.br`}>
      <Heading as="h1" style={headingStyle}>
        Join {workspaceName}
      </Heading>
      <Text style={bodyTextStyle}>
        <strong>{inviterName}</strong> invited you to join the &quot;{workspaceName}&quot; workspace on
        tracking.gritoweb.com.br.
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
  url: "https://tracking.gritoweb.com.br/accept-invite?id=example-invite-id",
};

export default WorkspaceInvitationEmail;

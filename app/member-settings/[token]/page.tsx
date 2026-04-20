import { notFound } from "next/navigation";

import { MemberPaymentSettingsPage } from "@/components/member-payment-settings-page";
import { db } from "@/lib/db";
import { serializePaymentProfile } from "@/lib/serialize";

type Props = {
  params: {
    token: string;
  };
  searchParams?: {
    error?: string;
    saved?: string;
  };
};

export default async function MemberSettingsByTokenPage({
  params,
  searchParams
}: Props) {
  const member = await db.member.findUnique({
    where: {
      paymentSettingsToken: params.token
    },
    include: {
      group: true,
      paymentProfile: true
    }
  });

  if (!member) {
    notFound();
  }

  return (
    <MemberPaymentSettingsPage
      token={params.token}
      memberName={member.name}
      groupName={member.group.name}
      paymentProfile={serializePaymentProfile(member.paymentProfile)}
      error={searchParams?.error ?? null}
      saved={searchParams?.saved === "1"}
    />
  );
}

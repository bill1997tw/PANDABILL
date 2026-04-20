import { GroupDetailPage } from "@/components/group-detail-page";

type Props = {
  params: {
    id: string;
  };
};

export default function GroupPage({ params }: Props) {
  return <GroupDetailPage groupId={params.id} />;
}

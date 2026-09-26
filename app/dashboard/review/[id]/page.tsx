import { DeveloperReview } from '@/components/developer-review';
export default function ReviewDetailPage({params}:{params:{id:string}}) { return <DeveloperReview reportId={params.id}/>; }

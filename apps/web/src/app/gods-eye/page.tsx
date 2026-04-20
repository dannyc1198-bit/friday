import dynamic from 'next/dynamic';

const GodsEye = dynamic(() => import('./GodsEye'), { ssr: false });

export const metadata = {
  title: "F.R.I.D.A.Y. — God's Eye",
};

export default function GodsEyePage() {
  return <GodsEye />;
}

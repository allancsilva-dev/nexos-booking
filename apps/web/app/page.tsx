import { ERROR_CODES } from "@nexos/shared";

export default function HomePage() {
  return <main>{`Contract base loaded: ${ERROR_CODES.length} error codes`}</main>;
}

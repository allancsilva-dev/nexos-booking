import { SetMetadata } from "@nestjs/common";

export const REQUIRE_IF_MATCH_KEY = "requireIfMatch";
export const RequireIfMatch = () => SetMetadata(REQUIRE_IF_MATCH_KEY, true);

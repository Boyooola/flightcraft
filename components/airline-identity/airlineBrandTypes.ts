import type { AirlineLogoId } from "./airlineLogoCatalog";

export type AirlineBrand = {
  airlineName: string;
  airlineCode: string;
  logoId: AirlineLogoId;
  primaryColor: string;
  secondaryColor: string;
};

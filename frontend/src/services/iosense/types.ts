/** Wire types for the IOsense connector API. */

export interface SsoTokenResponse {
  success: boolean;
  token: string;
  organisation: string;
  userId: string;
  errors?: string[];
}

export interface LoginResponse {
  success: boolean;
  authorization?: string;
  token?: string;
  user?: { _id: string; email: string; name?: string };
  organisation?: string;
  error?: { message?: string } | string;
}

export interface IosenseDevice {
  devID: string;
  devName?: string;
  devTypeID?: string;
  devTypeName?: string;
  location?: { latitude?: number; longitude?: number };
  tags?: string[];
  star?: boolean;
}

export interface FindUserDevicesResponse {
  data?: { devices?: IosenseDevice[]; totalCount?: number };
  devices?: IosenseDevice[];
  success?: boolean;
}

export interface DeviceSensor {
  sensorId: string;
  sensorName: string;
  globalName?: string;
}

export interface DeviceMetadata {
  devID: string;
  devName?: string;
  sensors?: DeviceSensor[];
  location?: { latitude?: number; longitude?: number };
  params?: Record<string, unknown>;
}

/** One series requested from getWidgetData. */
export interface WidgetDataConfig {
  devID: string;
  sensors: string[];
  /** Aggregation applied inside each time bucket. */
  operator?: "mean" | "max" | "min" | "sum" | "last" | "first" | "count";
  metricType?: "device" | "cluster" | "compute";
}

export interface WidgetDataRequest {
  /** Epoch ms. */
  startTime: number;
  /** Epoch ms. */
  endTime: number;
  timezone: string;
  /** Numeric size of the bucket, paired with timeFrame. */
  timeBucket: number;
  timeFrame: "minute" | "hour" | "day" | "month" | "year";
  type: "device" | "cluster" | "compute";
  cycleTime?: number;
  config: WidgetDataConfig[];
}

export interface WidgetDataPoint {
  time: number;
  value: number | null;
}

export interface WidgetDataSeries {
  devID: string;
  sensorId: string;
  data: WidgetDataPoint[];
}

export interface WidgetDataResponse {
  success?: boolean;
  data?: Record<string, Record<string, WidgetDataPoint[]>> | WidgetDataSeries[];
}

export interface LastDataPoint {
  devID: string;
  sensorId: string;
  value: number | string | null;
  time: number;
}

export interface UserInsight {
  _id: string;
  title?: string;
  description?: string;
  severity?: string;
  source?: { devID?: string; sensorId?: string };
  createdAt?: string;
  tags?: string[];
  starred?: boolean;
}

export interface UserInsightsResponse {
  success?: boolean;
  data?: { insights?: UserInsight[]; totalCount?: number };
}

export interface IosenseError extends Error {
  status?: number;
  endpoint?: string;
}

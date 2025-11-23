// src/types/ndt7.d.ts
declare module '@m-lab/ndt7' {
  export interface NDT7Config {
    userAcceptedDataPolicy: boolean;
    server?: string;
    [key: string]: any;
  }

  export interface NDT7Callbacks {
    error?: (err: any) => void;
    downloadMeasurement?: (data: any) => void;
    downloadComplete?: (data: any) => void;
    uploadMeasurement?: (data: any) => void;
    uploadComplete?: (data: any) => void;
  }

  export interface NDT7 {
    test: (config: NDT7Config, callbacks: NDT7Callbacks) => Promise<void>;
  }

  const ndt7: NDT7;
  export default ndt7;
}

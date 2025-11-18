
export type NativeImageViewerProps = {
  visible: boolean;
  [k: string]: any;
};

export default function NativeImageViewer(_props: NativeImageViewerProps) {
  // En web no usamos la lib; devolvemos null
  return null;
}
import React from "react";
import ImageViewing from "react-native-image-viewing";

// Toma el tipo de props directamente del componente
export type NativeImageViewerProps = React.ComponentProps<typeof ImageViewing>;

export default function NativeImageViewer(props: NativeImageViewerProps) {
  return <ImageViewing {...props} />;
}
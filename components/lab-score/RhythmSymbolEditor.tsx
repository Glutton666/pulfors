import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Ellipse, Line, Path } from "react-native-svg";
import type { Shape, SymbolMeaning, SymbolRole } from "@/lib/rhythm-lab/types";

type Props = {
  name: string;
  description: string;
  role: SymbolRole;
  meaning: SymbolMeaning;
  shapeType: Shape["type"];
  shapes: Shape[];
  selectedShapeId: string | null;
  colors: { accent: string; background: string; border: string; text: string; textSecondary: string; textTertiary: string };
  copy: { name: string; description: string; shapes: string; role: string; meaning: string; save: string; removeShape: string };
  onName: (value: string) => void;
  onDescription: (value: string) => void;
  onRole: (value: SymbolRole) => void;
  onMeaning: (value: SymbolMeaning) => void;
  onShapeType: (value: Shape["type"]) => void;
  onSelectShape: (value: string | null) => void;
  onAddShape: () => void;
  onUpdateShape: (id: string, field: string, value: number) => void;
  onRemoveShape: (id: string) => void;
  onSave: () => void;
};

export function RhythmSymbolEditor(props: Props) {
  const { colors: C, copy } = props;
  const selected = props.shapes.find((shape) => shape.id === props.selectedShapeId);
  const fields: [string, number][] = selected?.type === "ellipse" ? [["cx", selected.cx], ["cy", selected.cy], ["rx", selected.rx], ["ry", selected.ry]] :
    selected?.type === "line" ? [["x1", selected.x1], ["y1", selected.y1], ["x2", selected.x2], ["y2", selected.y2]] :
      selected ? [["x1", selected.x1], ["y1", selected.y1], ["cx", selected.cx], ["cy", selected.cy], ["x2", selected.x2], ["y2", selected.y2]] : [];
  return <View style={s.form}>
    <TextInput placeholder={copy.name} placeholderTextColor={C.textTertiary} value={props.name} onChangeText={props.onName} style={[s.input, { color: C.text, borderColor: C.border }]} />
    <TextInput placeholder={copy.description} placeholderTextColor={C.textTertiary} value={props.description} onChangeText={props.onDescription} style={[s.input, { color: C.text, borderColor: C.border }]} />
    <View style={s.row}>{(["line", "ellipse", "curve"] as const).map((value) => <Pressable key={value} onPress={() => props.onShapeType(value)} style={[s.chip, { borderColor: props.shapeType === value ? C.accent : C.border }]}><Text style={{ color: C.text }}>{value}</Text></Pressable>)}<Pressable onPress={props.onAddShape} style={[s.chip, { borderColor: C.accent }]}><Text style={{ color: C.accent }}>+ {copy.shapes}</Text></Pressable></View>
    <View style={s.row}>{props.shapes.map((shape, index) => <Pressable key={shape.id} onPress={() => props.onSelectShape(shape.id)} style={[s.chip, { borderColor: props.selectedShapeId === shape.id ? C.accent : C.border }]}><Text style={{ color: C.text }}>{shape.type} {index + 1}</Text></Pressable>)}{props.selectedShapeId && <Pressable onPress={() => props.onRemoveShape(props.selectedShapeId!)} style={[s.chip, { borderColor: C.border }]}><Text style={{ color: C.text }}>{copy.removeShape}</Text></Pressable>}</View>
    {selected && <View style={s.fields}>{fields.map(([field, value]) => <View key={field} style={s.field}><Text style={{ color: C.textSecondary, fontSize: 10 }}>{field}</Text><TextInput value={String(value)} onChangeText={(v) => props.onUpdateShape(selected.id, field, Number(v) || 0)} keyboardType="decimal-pad" style={[s.coordinate, { color: C.text, borderColor: C.border }]} /></View>)}</View>}
    <View style={s.row}>{(["rhythm", "pitch", "expression", "structure"] as const).map((value) => <Pressable key={value} onPress={() => props.onRole(value)} style={[s.chip, { borderColor: props.role === value ? C.accent : C.border }]}><Text style={{ color: C.text }}>{value}</Text></Pressable>)}</View>
    <Text style={{ color: C.textSecondary, fontSize: 11 }}>{copy.role} · {copy.meaning}</Text>
    <View style={s.row}>{(["flam", "drag", "diddle", "accent", "annotation"] as const).map((value) => <Pressable key={value} onPress={() => props.onMeaning(value)} style={[s.chip, { borderColor: props.meaning === value ? C.accent : C.border }]}><Text style={{ color: C.text }}>{value}</Text></Pressable>)}</View>
    <SymbolPreview shapes={props.shapes} />
    <Pressable onPress={props.onSave} style={[s.save, { backgroundColor: C.accent }]}><Text style={{ color: C.background }}>{copy.save}</Text></Pressable>
  </View>;
}

function SymbolPreview({ shapes }: { shapes: Shape[] }) {
  return <Svg width={140} height={70} viewBox="0 0 100 100" style={s.preview}>
    {shapes.map((shape) => shape.type === "line" ? <Line key={shape.id} x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} stroke="#111" strokeWidth="2" /> :
      shape.type === "ellipse" ? <Ellipse key={shape.id} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} stroke="#111" fill="none" strokeWidth="2" /> :
        <Path key={shape.id} d={`M${shape.x1},${shape.y1} Q${shape.cx},${shape.cy} ${shape.x2},${shape.y2}`} stroke="#111" fill="none" strokeWidth="2" />)}
  </Svg>;
}

const s = StyleSheet.create({
  form: { marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: "rgba(128,128,128,0.4)", paddingTop: 8 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 8 },
  row: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginVertical: 6 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  fields: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginVertical: 6 },
  field: { alignItems: "center", gap: 3 },
  coordinate: { minWidth: 42, height: 34, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, textAlign: "center" },
  preview: { backgroundColor: "#fff", borderRadius: 8, marginVertical: 8 },
  save: { flexDirection: "row", gap: 5, alignItems: "center", paddingHorizontal: 11, paddingVertical: 8, borderRadius: 8, alignSelf: "flex-start" },
});

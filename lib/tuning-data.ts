export interface TuningString {
  note: string;
  octave: number;
  freq: number;
  label: { ko: string; en: string };
}

export interface Instrument {
  id: string;
  name: { ko: string; en: string };
  strings: TuningString[];
}

export type TuningCategoryIcon = "guitar-acoustic" | "music-note" | "violin" | "music-circle" | "music-box" | "bell-outline";

export interface InstrumentCategory {
  id: string;
  name: { ko: string; en: string };
  icon: TuningCategoryIcon;
  instruments: Instrument[];
}

export const TUNING_DATA: InstrumentCategory[] = [
  {
    id: "guitar",
    name: { ko: "기타류", en: "Guitars" },
    icon: "guitar-acoustic",
    instruments: [
      {
        id: "guitar6",
        name: { ko: "기타 (6현)", en: "Guitar (6-string)" },
        strings: [
          { note: "E", octave: 2, freq: 82.41, label: { ko: "6번줄 E", en: "6th E" } },
          { note: "A", octave: 2, freq: 110.00, label: { ko: "5번줄 A", en: "5th A" } },
          { note: "D", octave: 3, freq: 146.83, label: { ko: "4번줄 D", en: "4th D" } },
          { note: "G", octave: 3, freq: 196.00, label: { ko: "3번줄 G", en: "3rd G" } },
          { note: "B", octave: 3, freq: 246.94, label: { ko: "2번줄 B", en: "2nd B" } },
          { note: "E", octave: 4, freq: 329.63, label: { ko: "1번줄 E", en: "1st E" } },
        ],
      },
      {
        id: "guitar7",
        name: { ko: "7현 기타", en: "7-string Guitar" },
        strings: [
          { note: "B", octave: 1, freq: 61.74, label: { ko: "7번줄 B", en: "7th B" } },
          { note: "E", octave: 2, freq: 82.41, label: { ko: "6번줄 E", en: "6th E" } },
          { note: "A", octave: 2, freq: 110.00, label: { ko: "5번줄 A", en: "5th A" } },
          { note: "D", octave: 3, freq: 146.83, label: { ko: "4번줄 D", en: "4th D" } },
          { note: "G", octave: 3, freq: 196.00, label: { ko: "3번줄 G", en: "3rd G" } },
          { note: "B", octave: 3, freq: 246.94, label: { ko: "2번줄 B", en: "2nd B" } },
          { note: "E", octave: 4, freq: 329.63, label: { ko: "1번줄 E", en: "1st E" } },
        ],
      },
      {
        id: "guitar12",
        name: { ko: "12현 기타", en: "12-string Guitar" },
        strings: [
          { note: "E", octave: 2, freq: 82.41, label: { ko: "6번줄 E", en: "6th E" } },
          { note: "E", octave: 3, freq: 164.81, label: { ko: "6번줄 E (옥타브)", en: "6th E (octave)" } },
          { note: "A", octave: 2, freq: 110.00, label: { ko: "5번줄 A", en: "5th A" } },
          { note: "A", octave: 3, freq: 220.00, label: { ko: "5번줄 A (옥타브)", en: "5th A (octave)" } },
          { note: "D", octave: 3, freq: 146.83, label: { ko: "4번줄 D", en: "4th D" } },
          { note: "D", octave: 4, freq: 293.66, label: { ko: "4번줄 D (옥타브)", en: "4th D (octave)" } },
          { note: "G", octave: 3, freq: 196.00, label: { ko: "3번줄 G", en: "3rd G" } },
          { note: "G", octave: 4, freq: 392.00, label: { ko: "3번줄 G (옥타브)", en: "3rd G (octave)" } },
          { note: "B", octave: 3, freq: 246.94, label: { ko: "2번줄 B", en: "2nd B" } },
          { note: "B", octave: 3, freq: 246.94, label: { ko: "2번줄 B (유니슨)", en: "2nd B (unison)" } },
          { note: "E", octave: 4, freq: 329.63, label: { ko: "1번줄 E", en: "1st E" } },
          { note: "E", octave: 4, freq: 329.63, label: { ko: "1번줄 E (유니슨)", en: "1st E (unison)" } },
        ],
      },
      {
        id: "bass4",
        name: { ko: "베이스 기타 (4현)", en: "Bass Guitar (4-string)" },
        strings: [
          { note: "E", octave: 1, freq: 41.20, label: { ko: "4번줄 E", en: "4th E" } },
          { note: "A", octave: 1, freq: 55.00, label: { ko: "3번줄 A", en: "3rd A" } },
          { note: "D", octave: 2, freq: 73.42, label: { ko: "2번줄 D", en: "2nd D" } },
          { note: "G", octave: 2, freq: 98.00, label: { ko: "1번줄 G", en: "1st G" } },
        ],
      },
      {
        id: "bass5",
        name: { ko: "베이스 기타 (5현)", en: "Bass Guitar (5-string)" },
        strings: [
          { note: "B", octave: 0, freq: 30.87, label: { ko: "5번줄 B", en: "5th B" } },
          { note: "E", octave: 1, freq: 41.20, label: { ko: "4번줄 E", en: "4th E" } },
          { note: "A", octave: 1, freq: 55.00, label: { ko: "3번줄 A", en: "3rd A" } },
          { note: "D", octave: 2, freq: 73.42, label: { ko: "2번줄 D", en: "2nd D" } },
          { note: "G", octave: 2, freq: 98.00, label: { ko: "1번줄 G", en: "1st G" } },
        ],
      },
    ],
  },
  {
    id: "ukulele",
    name: { ko: "우쿨렐레류", en: "Ukuleles" },
    icon: "music-note",
    instruments: [
      {
        id: "ukulele_std",
        name: { ko: "소프라노/콘서트/테너", en: "Soprano/Concert/Tenor" },
        strings: [
          { note: "G", octave: 4, freq: 392.00, label: { ko: "4번줄 G", en: "4th G" } },
          { note: "C", octave: 4, freq: 261.63, label: { ko: "3번줄 C", en: "3rd C" } },
          { note: "E", octave: 4, freq: 329.63, label: { ko: "2번줄 E", en: "2nd E" } },
          { note: "A", octave: 4, freq: 440.00, label: { ko: "1번줄 A", en: "1st A" } },
        ],
      },
      {
        id: "ukulele_baritone",
        name: { ko: "바리톤 우쿨렐레", en: "Baritone Ukulele" },
        strings: [
          { note: "D", octave: 3, freq: 146.83, label: { ko: "4번줄 D", en: "4th D" } },
          { note: "G", octave: 3, freq: 196.00, label: { ko: "3번줄 G", en: "3rd G" } },
          { note: "B", octave: 3, freq: 246.94, label: { ko: "2번줄 B", en: "2nd B" } },
          { note: "E", octave: 4, freq: 329.63, label: { ko: "1번줄 E", en: "1st E" } },
        ],
      },
    ],
  },
  {
    id: "orchestra",
    name: { ko: "오케스트라 현악기", en: "Orchestra Strings" },
    icon: "violin",
    instruments: [
      {
        id: "violin",
        name: { ko: "바이올린", en: "Violin" },
        strings: [
          { note: "G", octave: 3, freq: 196.00, label: { ko: "G현", en: "G string" } },
          { note: "D", octave: 4, freq: 293.66, label: { ko: "D현", en: "D string" } },
          { note: "A", octave: 4, freq: 440.00, label: { ko: "A현", en: "A string" } },
          { note: "E", octave: 5, freq: 659.26, label: { ko: "E현", en: "E string" } },
        ],
      },
      {
        id: "viola",
        name: { ko: "비올라", en: "Viola" },
        strings: [
          { note: "C", octave: 3, freq: 130.81, label: { ko: "C현", en: "C string" } },
          { note: "G", octave: 3, freq: 196.00, label: { ko: "G현", en: "G string" } },
          { note: "D", octave: 4, freq: 293.66, label: { ko: "D현", en: "D string" } },
          { note: "A", octave: 4, freq: 440.00, label: { ko: "A현", en: "A string" } },
        ],
      },
      {
        id: "cello",
        name: { ko: "첼로", en: "Cello" },
        strings: [
          { note: "C", octave: 2, freq: 65.41, label: { ko: "C현", en: "C string" } },
          { note: "G", octave: 2, freq: 98.00, label: { ko: "G현", en: "G string" } },
          { note: "D", octave: 3, freq: 146.83, label: { ko: "D현", en: "D string" } },
          { note: "A", octave: 3, freq: 220.00, label: { ko: "A현", en: "A string" } },
        ],
      },
      {
        id: "contrabass",
        name: { ko: "콘트라베이스", en: "Double Bass" },
        strings: [
          { note: "E", octave: 1, freq: 41.20, label: { ko: "E현", en: "E string" } },
          { note: "A", octave: 1, freq: 55.00, label: { ko: "A현", en: "A string" } },
          { note: "D", octave: 2, freq: 73.42, label: { ko: "D현", en: "D string" } },
          { note: "G", octave: 2, freq: 98.00, label: { ko: "G현", en: "G string" } },
        ],
      },
    ],
  },
  {
    id: "western_other",
    name: { ko: "기타 서양 현악기", en: "Other Western Strings" },
    icon: "music-circle",
    instruments: [
      {
        id: "mandolin",
        name: { ko: "만돌린", en: "Mandolin" },
        strings: [
          { note: "G", octave: 3, freq: 196.00, label: { ko: "4번줄 G", en: "4th G" } },
          { note: "D", octave: 4, freq: 293.66, label: { ko: "3번줄 D", en: "3rd D" } },
          { note: "A", octave: 4, freq: 440.00, label: { ko: "2번줄 A", en: "2nd A" } },
          { note: "E", octave: 5, freq: 659.26, label: { ko: "1번줄 E", en: "1st E" } },
        ],
      },
      {
        id: "banjo5",
        name: { ko: "밴조 (5현)", en: "Banjo (5-string)" },
        strings: [
          { note: "G", octave: 4, freq: 392.00, label: { ko: "5번줄 G", en: "5th G" } },
          { note: "D", octave: 3, freq: 146.83, label: { ko: "4번줄 D", en: "4th D" } },
          { note: "G", octave: 3, freq: 196.00, label: { ko: "3번줄 G", en: "3rd G" } },
          { note: "B", octave: 3, freq: 246.94, label: { ko: "2번줄 B", en: "2nd B" } },
          { note: "D", octave: 4, freq: 293.66, label: { ko: "1번줄 D", en: "1st D" } },
        ],
      },
    ],
  },
  {
    id: "asian_traditional",
    name: { ko: "동양 전통 악기", en: "Asian Traditional" },
    icon: "music-box",
    instruments: [
      {
        id: "gayageum",
        name: { ko: "가야금 (12현)", en: "Gayageum (12-string)" },
        strings: [
          { note: "A#", octave: 2, freq: 116.54, label: { ko: "1현 (황)", en: "1st (Hwang)" } },
          { note: "C", octave: 3, freq: 130.81, label: { ko: "2현 (태)", en: "2nd (Tae)" } },
          { note: "D#", octave: 3, freq: 155.56, label: { ko: "3현 (중)", en: "3rd (Jung)" } },
          { note: "F", octave: 3, freq: 174.61, label: { ko: "4현 (임)", en: "4th (Im)" } },
          { note: "G#", octave: 3, freq: 207.65, label: { ko: "5현 (무)", en: "5th (Mu)" } },
          { note: "A#", octave: 3, freq: 233.08, label: { ko: "6현 (황)", en: "6th (Hwang)" } },
          { note: "C", octave: 4, freq: 261.63, label: { ko: "7현 (태)", en: "7th (Tae)" } },
          { note: "D#", octave: 4, freq: 311.13, label: { ko: "8현 (중)", en: "8th (Jung)" } },
          { note: "F", octave: 4, freq: 349.23, label: { ko: "9현 (임)", en: "9th (Im)" } },
          { note: "G#", octave: 4, freq: 415.30, label: { ko: "10현 (무)", en: "10th (Mu)" } },
          { note: "A#", octave: 4, freq: 466.16, label: { ko: "11현 (황)", en: "11th (Hwang)" } },
          { note: "C", octave: 5, freq: 523.25, label: { ko: "12현 (태)", en: "12th (Tae)" } },
        ],
      },
      {
        id: "geomungo",
        name: { ko: "거문고 (6현)", en: "Geomungo (6-string)" },
        strings: [
          { note: "A#", octave: 2, freq: 116.54, label: { ko: "문현 (1현)", en: "1st (Munhyeon)" } },
          { note: "D#", octave: 3, freq: 155.56, label: { ko: "유현 (2현)", en: "2nd (Yuhyeon)" } },
          { note: "A#", octave: 2, freq: 116.54, label: { ko: "대현 (3현)", en: "3rd (Daehyeon)" } },
          { note: "A#", octave: 3, freq: 233.08, label: { ko: "괘상청 (4현)", en: "4th (Goesangcheong)" } },
          { note: "D#", octave: 3, freq: 155.56, label: { ko: "괘하청 (5현)", en: "5th (Goehacheong)" } },
          { note: "A#", octave: 2, freq: 116.54, label: { ko: "무현 (6현)", en: "6th (Muhyeon)" } },
        ],
      },
      {
        id: "haegeum",
        name: { ko: "해금", en: "Haegeum" },
        strings: [
          { note: "A#", octave: 3, freq: 233.08, label: { ko: "중현 (안줄)", en: "Inner (Jung)" } },
          { note: "D#", octave: 4, freq: 311.13, label: { ko: "유현 (바깥줄)", en: "Outer (Yu)" } },
        ],
      },
      {
        id: "ajaeng",
        name: { ko: "아쟁", en: "Ajaeng" },
        strings: [
          { note: "A#", octave: 2, freq: 116.54, label: { ko: "1현 (황)", en: "1st (Hwang)" } },
          { note: "C", octave: 3, freq: 130.81, label: { ko: "2현 (태)", en: "2nd (Tae)" } },
          { note: "D#", octave: 3, freq: 155.56, label: { ko: "3현 (중)", en: "3rd (Jung)" } },
          { note: "F", octave: 3, freq: 174.61, label: { ko: "4현 (임)", en: "4th (Im)" } },
          { note: "G#", octave: 3, freq: 207.65, label: { ko: "5현 (무)", en: "5th (Mu)" } },
          { note: "A#", octave: 3, freq: 233.08, label: { ko: "6현 (황)", en: "6th (Hwang)" } },
          { note: "C", octave: 4, freq: 261.63, label: { ko: "7현 (태)", en: "7th (Tae)" } },
        ],
      },
      {
        id: "pipa",
        name: { ko: "비파", en: "Pipa" },
        strings: [
          { note: "A", octave: 2, freq: 110.00, label: { ko: "1현 A", en: "1st A" } },
          { note: "D", octave: 3, freq: 146.83, label: { ko: "2현 D", en: "2nd D" } },
          { note: "E", octave: 3, freq: 164.81, label: { ko: "3현 E", en: "3rd E" } },
          { note: "A", octave: 3, freq: 220.00, label: { ko: "4현 A", en: "4th A" } },
        ],
      },
      {
        id: "erhu",
        name: { ko: "얼후 (이호)", en: "Erhu" },
        strings: [
          { note: "D", octave: 4, freq: 293.66, label: { ko: "안현 D", en: "Inner D" } },
          { note: "A", octave: 4, freq: 440.00, label: { ko: "바깥현 A", en: "Outer A" } },
        ],
      },
      {
        id: "shamisen",
        name: { ko: "샤미센", en: "Shamisen" },
        strings: [
          { note: "C", octave: 3, freq: 130.81, label: { ko: "1현 (이치노이토)", en: "1st (Ichi-no-ito)" } },
          { note: "F", octave: 3, freq: 174.61, label: { ko: "2현 (니노이토)", en: "2nd (Ni-no-ito)" } },
          { note: "C", octave: 4, freq: 261.63, label: { ko: "3현 (산노이토)", en: "3rd (San-no-ito)" } },
        ],
      },
      {
        id: "koto",
        name: { ko: "고토 (13현)", en: "Koto (13-string)" },
        strings: [
          { note: "D", octave: 3, freq: 146.83, label: { ko: "1현", en: "1st" } },
          { note: "G", octave: 3, freq: 196.00, label: { ko: "2현", en: "2nd" } },
          { note: "A", octave: 3, freq: 220.00, label: { ko: "3현", en: "3rd" } },
          { note: "A#", octave: 3, freq: 233.08, label: { ko: "4현", en: "4th" } },
          { note: "D", octave: 4, freq: 293.66, label: { ko: "5현", en: "5th" } },
          { note: "D#", octave: 4, freq: 311.13, label: { ko: "6현", en: "6th" } },
          { note: "G", octave: 4, freq: 392.00, label: { ko: "7현", en: "7th" } },
          { note: "A", octave: 4, freq: 440.00, label: { ko: "8현", en: "8th" } },
          { note: "A#", octave: 4, freq: 466.16, label: { ko: "9현", en: "9th" } },
          { note: "D", octave: 5, freq: 587.33, label: { ko: "10현", en: "10th" } },
          { note: "D#", octave: 5, freq: 622.25, label: { ko: "11현", en: "11th" } },
          { note: "G", octave: 5, freq: 783.99, label: { ko: "12현", en: "12th" } },
          { note: "A", octave: 5, freq: 880.00, label: { ko: "13현 (巾)", en: "13th (Kin)" } },
        ],
      },
    ],
  },
  {
    id: "percussion",
    name: { ko: "타악기", en: "Percussion" },
    icon: "bell-outline",
    instruments: [
      {
        id: "timpani",
        name: { ko: "팀파니", en: "Timpani" },
        strings: [
          { note: "D", octave: 2, freq: 73.42, label: { ko: '32" D', en: '32" D' } },
          { note: "F", octave: 2, freq: 87.31, label: { ko: '32" F', en: '32" F' } },
          { note: "A", octave: 2, freq: 110.00, label: { ko: '29" A', en: '29" A' } },
          { note: "B♭", octave: 2, freq: 116.54, label: { ko: '29" B♭', en: '29" B♭' } },
          { note: "C", octave: 3, freq: 130.81, label: { ko: '26" C', en: '26" C' } },
          { note: "D", octave: 3, freq: 146.83, label: { ko: '26" D', en: '26" D' } },
          { note: "E", octave: 3, freq: 164.81, label: { ko: '23" E', en: '23" E' } },
          { note: "F", octave: 3, freq: 174.61, label: { ko: '23" F', en: '23" F' } },
        ],
      },
      {
        id: "tabla",
        name: { ko: "타블라", en: "Tabla" },
        strings: [
          { note: "C", octave: 3, freq: 130.81, label: { ko: "다야 C", en: "Daya C" } },
          { note: "C#", octave: 3, freq: 138.59, label: { ko: "다야 C#", en: "Daya C#" } },
          { note: "D", octave: 3, freq: 146.83, label: { ko: "다야 D", en: "Daya D" } },
          { note: "D#", octave: 3, freq: 155.56, label: { ko: "다야 D#", en: "Daya D#" } },
          { note: "E", octave: 3, freq: 164.81, label: { ko: "다야 E", en: "Daya E" } },
          { note: "F", octave: 3, freq: 174.61, label: { ko: "다야 F", en: "Daya F" } },
        ],
      },
      {
        id: "djembe",
        name: { ko: "젬베", en: "Djembe" },
        strings: [
          { note: "D", octave: 3, freq: 146.83, label: { ko: "베이스 D", en: "Bass D" } },
          { note: "F", octave: 3, freq: 174.61, label: { ko: "톤 F", en: "Tone F" } },
          { note: "A", octave: 3, freq: 220.00, label: { ko: "슬랩 A", en: "Slap A" } },
        ],
      },
      {
        id: "steelpan",
        name: { ko: "스틸팬", en: "Steel Pan" },
        strings: [
          { note: "C", octave: 4, freq: 261.63, label: { ko: "C4", en: "C4" } },
          { note: "D", octave: 4, freq: 293.66, label: { ko: "D4", en: "D4" } },
          { note: "E", octave: 4, freq: 329.63, label: { ko: "E4", en: "E4" } },
          { note: "F", octave: 4, freq: 349.23, label: { ko: "F4", en: "F4" } },
          { note: "G", octave: 4, freq: 392.00, label: { ko: "G4", en: "G4" } },
          { note: "A", octave: 4, freq: 440.00, label: { ko: "A4", en: "A4" } },
          { note: "B", octave: 4, freq: 493.88, label: { ko: "B4", en: "B4" } },
          { note: "C", octave: 5, freq: 523.25, label: { ko: "C5", en: "C5" } },
        ],
      },
      {
        id: "bongo",
        name: { ko: "봉고", en: "Bongo" },
        strings: [
          { note: "A", octave: 3, freq: 220.00, label: { ko: "마초 (작은북)", en: "Macho (small)" } },
          { note: "E", octave: 3, freq: 164.81, label: { ko: "헴브라 (큰북)", en: "Hembra (large)" } },
        ],
      },
      {
        id: "conga",
        name: { ko: "콩가", en: "Conga" },
        strings: [
          { note: "C", octave: 3, freq: 130.81, label: { ko: "툼바 (낮은음)", en: "Tumba (low)" } },
          { note: "D", octave: 3, freq: 146.83, label: { ko: "콩가 (중간음)", en: "Conga (mid)" } },
          { note: "F", octave: 3, freq: 174.61, label: { ko: "퀸토 (높은음)", en: "Quinto (high)" } },
        ],
      },
      {
        id: "snare_drum",
        name: { ko: "스네어 드럼", en: "Snare Drum" },
        strings: [
          { note: "E", octave: 3, freq: 164.81, label: { ko: "배터 헤드 E3", en: "Batter head E3" } },
          { note: "A", octave: 3, freq: 220.00, label: { ko: "배터 헤드 A3", en: "Batter head A3" } },
          { note: "B", octave: 3, freq: 246.94, label: { ko: "스네어 사이드 B3", en: "Snare side B3" } },
        ],
      },
      {
        id: "tom_drum",
        name: { ko: "탐 (드럼셋)", en: "Toms (Drum Set)" },
        strings: [
          { note: "E", octave: 2, freq: 82.41, label: { ko: "플로어탐 16\"", en: "Floor tom 16\"" } },
          { note: "A", octave: 2, freq: 110.00, label: { ko: "로우탐 14\"", en: "Low tom 14\"" } },
          { note: "D", octave: 3, freq: 146.83, label: { ko: "미드탐 12\"", en: "Mid tom 12\"" } },
          { note: "G", octave: 3, freq: 196.00, label: { ko: "하이탐 10\"", en: "High tom 10\"" } },
        ],
      },
      {
        id: "bass_drum",
        name: { ko: "베이스 드럼", en: "Bass Drum (Kick)" },
        strings: [
          { note: "C", octave: 2, freq: 65.41, label: { ko: "배터 헤드 C2", en: "Batter head C2" } },
          { note: "E", octave: 2, freq: 82.41, label: { ko: "배터 헤드 E2", en: "Batter head E2" } },
          { note: "G", octave: 2, freq: 98.00, label: { ko: "레조넌트 헤드 G2", en: "Resonant head G2" } },
        ],
      },
      {
        id: "janggu",
        name: { ko: "장구", en: "Janggu" },
        strings: [
          { note: "A", octave: 2, freq: 110.00, label: { ko: "궁편 (왼쪽)", en: "Gung (left)" } },
          { note: "E", octave: 3, freq: 164.81, label: { ko: "열편 (오른쪽)", en: "Yeol (right)" } },
        ],
      },
    ],
  },
];

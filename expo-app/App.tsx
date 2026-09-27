import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Dimensions,
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Camera, CameraType, CameraView } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { GrandHotel_400Regular, useFonts } from '@expo-google-fonts/grand-hotel';
import {
  contactsStatus,
  currentPlace,
  loadDeviceContacts,
  locationStatus,
  notificationsStatus,
  pickFromLibrary,
  pickManyFromLibrary,
  pickVideoFromLibrary,
  saveToLibrary,
  sendTestNotification,
  takePhoto,
  ensureNotifications,
  pushNeedsDevBuild,
  type DeviceContact,
} from './src/device';
import { VideoView, useVideoPlayer } from 'expo-video';
import { manipulateAsync, FlipType, SaveFormat } from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_VERSION, createPersistence } from './src/persistence';
import { DEFAULT_CIRCLES, circleById, circlesForUser, feedForCircle } from './src/circles';
import { success, tap } from './src/haptics';
import {
  ME,
  POST_TONES,
  SEED_MESSAGES,
  SEED_POSTS,
  SEED_STORIES,
  SEED_USERS,
  buildActivity,
  conversationWith,
  extractHashtags,
  inboxThreads,
  normalizeStories,
  searchPosts,
  searchUsers,
  storyMedia,
  timeAgo,
  toggleInList,
  toneOverlay,
  type Message,
  type Post,
  type StoryGroup,
  type User,
} from './src/social';

import {
  DEFAULT_SETTINGS,
  LANGUAGES,
  LOGIN_ACTIVITY,
  type SettingsState,
} from './src/settings';
import { DarkTheme, LightTheme, ThemeRef, applyTheme, type Theme } from './src/theme';

const ICON_SIZE = 26;
const REEL_HEIGHT = Math.round(Dimensions.get('window').height);

const STORY_GRADIENT = ['#FEDA75', '#FA7E1E', '#D62976', '#962FBF', '#4F5BD5'] as const;

function Avatar({
  uri,
  size = 32,
  ring = false,
}: {
  uri: string;
  size?: number;
  ring?: boolean | 'close' | 'seen';
}) {
  const outer = size + 10;
  if (ring === true) {
    return (
      <LinearGradient
        colors={[...STORY_GRADIENT]}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={{
          width: outer,
          height: outer,
          borderRadius: outer / 2,
          padding: 3,
        }}>
        <View
          style={{
            flex: 1,
            borderRadius: (size + 4) / 2,
            padding: 2.5,
            backgroundColor: '#000',
          }}>
          <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
        </View>
      </LinearGradient>
    );
  }
  const borderColor = ring === 'close' ? '#34c759' : ring === 'seen' ? '#d9d9d9' : 'transparent';
  return (
    <View
      style={{
        width: outer,
        height: outer,
        borderRadius: outer / 2,
        padding: 2.5,
        backgroundColor: ring ? borderColor : 'transparent',
      }}>
      <View
        style={{
          flex: 1,
          borderRadius: (size + 5) / 2,
          padding: 2,
          backgroundColor: '#fff',
        }}>
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      </View>
    </View>
  );
}

function userByName(users: User[], username: string): User {
  return users.find((u) => u.username === username) ?? users[0];
}

function viewsForPost(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100000;
  const v = 1200 + h * 37;
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return `${v}`;
}

function ToggleRow({ label, hint, value, onToggle }: { label: string; hint?: string; value: boolean; onToggle: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.settingsRow, pressed && { opacity: 0.55 }]}
      onPress={onToggle}>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingsRowTxt}>{label}</Text>
        {hint ? <Text style={styles.muted}>{hint}</Text> : null}
      </View>
      <View style={[styles.switch, value && styles.switchOn]}>
        <View style={[styles.knob, value && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

function MenuRow({ icon, title, onPress }: { icon: string; title: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.settingsRow, pressed && { opacity: 0.55 }]}
      onPress={onPress}>
      <MaterialCommunityIcons name={icon as never} size={24} color={ThemeRef.colors.text} />
      <Text style={styles.settingsRowTxt}>{title}</Text>
      <MaterialCommunityIcons name="chevron-right" size={20} color={ThemeRef.colors.muted} />
    </Pressable>
  );
}

function AutoVideo({ uri, style }: { uri: string; style?: object }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={style as never}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

function FadeIn({ children }: { children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [v]);
  return <Animated.View style={{ opacity: v, flex: 1 }}>{children}</Animated.View>;
}

function Shimmer({ children }: { children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={{ opacity: v }}>{children}</Animated.View>;
}

function BootSkeleton() {
  const v = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View style={{ opacity: v, width: '100%', paddingHorizontal: 16, gap: 12, marginTop: 24 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#8e8e93' }} />
        <View style={{ flex: 1, height: 14, borderRadius: 7, backgroundColor: '#8e8e93' }} />
      </View>
      <View style={{ width: '100%', aspectRatio: 1, borderRadius: 16, backgroundColor: '#8e8e93' }} />
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#8e8e93' }} />
        <View style={{ flex: 1, height: 14, borderRadius: 7, backgroundColor: '#8e8e93' }} />
      </View>
    </Animated.View>
  );
}

function IconBtn({
  icon,
  label,
  onPress,
  size = ICON_SIZE,
  color,
  selected,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  size?: number;
  color?: string;
  selected?: boolean;
}) {
  const tint = color ?? ThemeRef.colors.text;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}>
      <MaterialCommunityIcons name={icon as never} size={size} color={tint} />
    </Pressable>
  );
}

function PermRow({ label, hint, granted, onRequest }: { label: string; hint: string; granted: boolean; onRequest: () => void }) {
  return (
    <View style={styles.thread}>
      <View style={[styles.permDot, granted && styles.permDotOn]} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: ThemeRef.colors.text, fontWeight: '600' }}>{label}</Text>
        <Text style={styles.muted}>{hint}</Text>
      </View>
      {!granted ? (
        <Pressable style={styles.reqBtn} onPress={onRequest}>
          <Text style={styles.publishTxt}>Allow</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const SONGS = [
  { title: 'Espresso', artist: 'Sabrina Carpenter', dur: '2:55' },
  { title: 'Birds of a Feather', artist: 'Billie Eilish', dur: '3:30' },
  { title: 'Blinding Lights', artist: 'The Weeknd', dur: '3:20' },
  { title: 'Levitating', artist: 'Dua Lipa', dur: '3:23' },
  { title: 'As It Was', artist: 'Harry Styles', dur: '2:47' },
  { title: 'Stay', artist: 'The Kid LAROI', dur: '2:21' },
  { title: 'Më E Mira', artist: 'Romeo Veshaj, Ermal Fejzullahu', dur: '2:35' },
  { title: 'YAMA', artist: 'DYSTINCT', dur: '2:39' },
  { title: 'Zemren', artist: 'Kida', dur: '2:16' },
  { title: 'MOLIS GNORISTIKAME', artist: 'Kidd, BLVD', dur: '2:26' },
];

const SONG_HUES = [348, 265, 210, 160, 25, 200, 320, 45, 140, 280];

const CREATE_SEEDS = ['create1', 'create2', 'create3', 'create4', 'create5', 'create6'];
const createPhoto = (seed: string) => `https://picsum.photos/seed/${seed}/600/600`;
const SEED_FOLLOWS: Record<string, string[]> = { vucms: ['ana', 'leo', 'mia'] };
const seedBookmarks = (): Set<string> =>
  new Set(DEFAULT_SETTINGS.collections.flatMap((c) => c.ids));

type Tab = 'home' | 'reels' | 'direct' | 'search' | 'profile';

export default function App() {
  const [users, setUsers] = useState<User[]>(SEED_USERS);
  const [posts, setPosts] = useState<Post[]>(SEED_POSTS);
  const [stories, setStories] = useState<StoryGroup[]>(SEED_STORIES);
  const [messages, setMessages] = useState<Message[]>(SEED_MESSAGES);
  const [follows, setFollows] = useState<Record<string, string[]>>(SEED_FOLLOWS);
  const [bookmarks, setBookmarks] = useState<Set<string>>(seedBookmarks());
  const [tab, setTab] = useState<Tab>('home');
  const [createOpen, setCreateOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  const [query, setQuery] = useState('');
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileMode, setProfileMode] = useState<'posts' | 'reels' | 'saved' | 'tagged'>('posts');
  const [storyIndex, setStoryIndex] = useState<number | null>(null);
  const [storyPage, setStoryPage] = useState(0);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [draftComment, setDraftComment] = useState('');
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState('');
  const [createCaption, setCreateCaption] = useState('');
  const [createSeed, setCreateSeed] = useState(CREATE_SEEDS[0]);
  const [pickedKind, setPickedKind] = useState<'image' | 'video'>('image');
  const [createTone, setCreateTone] = useState('normal');
  const [editBusy, setEditBusy] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<string | null>(null);
  const [reelIndex, setReelIndex] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [storySeed, setStorySeed] = useState('mystory1');
  const [optionsPostId, setOptionsPostId] = useState<string | null>(null);
  const [shopTag, setShopTag] = useState<string | null>(null);
  const [collectPostId, setCollectPostId] = useState<string | null>(null);
  const [newCollection, setNewCollection] = useState('');
  const [tagView, setTagView] = useState<string | null>(null);
  const [profileOptions, setProfileOptions] = useState(false);
  const [commentLikes, setCommentLikes] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);
  const [storyReply, setStoryReply] = useState('');
  const [storyLiked, setStoryLiked] = useState<Set<string>>(new Set());
  const [callState, setCallState] = useState<{ with: string; video: boolean; muted: boolean } | null>(null);
  const [convOptions, setConvOptions] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const [verifyName, setVerifyName] = useState('');
  const [verifySent, setVerifySent] = useState(false);
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [highlightName, setHighlightName] = useState('');
  const [exploreMode, setExploreMode] = useState<'posts' | 'reels' | 'people'>('posts');
  const [circles, setCircles] = useState(DEFAULT_CIRCLES);
  const [activeCircleId, setActiveCircleId] = useState<string | null>(null);
  const [reelH, setReelH] = useState(REEL_HEIGHT);
  const [reelsFriendsOnly, setReelsFriendsOnly] = useState(false);
  const [reelGifts, setReelGifts] = useState<Record<string, number>>({});
  const [circleMenuOpen, setCircleMenuOpen] = useState(false);
  const circleMenuAnim = useRef(new Animated.Value(0)).current;

  const toggleCircleMenu = useCallback(() => {
    tap();
    if (circleMenuOpen) {
      Animated.timing(circleMenuAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() =>
        setCircleMenuOpen(false),
      );
    } else {
      setCircleMenuOpen(true);
      Animated.spring(circleMenuAnim, { toValue: 1, useNativeDriver: true, damping: 20, stiffness: 260 }).start();
    }
  }, [circleMenuOpen, circleMenuAnim]);

  const pickCircle = useCallback(
    (id: string | null) => {
      tap();
      setActiveCircleId(id);
      Animated.timing(circleMenuAnim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() =>
        setCircleMenuOpen(false),
      );
    },
    [circleMenuAnim],
  );

  const patchSettings = useCallback((patch: Partial<SettingsState>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const toggleSettingList = useCallback((key: 'muted' | 'blocked' | 'restricted' | 'closeFriends', value: string) => {
    setSettings((prev) => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter((v) => v !== value)
        : [...prev[key], value],
    }));
  }, []);

  const [camPerm, requestCamPerm] = ImagePicker.useCameraPermissions();
  const [libPerm, requestLibPerm] = ImagePicker.useMediaLibraryPermissions();
  const [micPerm, setMicPerm] = useState<{ status: string; granted: boolean } | null>(null);
  const requestMicPerm = useCallback(async () => {
    const r = await Camera.requestMicrophonePermissionsAsync();
    setMicPerm({ status: r.status, granted: r.granted });
  }, []);
  const [extraPerms, setExtraPerms] = useState({ location: 'undetermined', contacts: 'undetermined', notifications: 'undetermined' });
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [storyUri, setStoryUri] = useState<string | null>(null);
  const [storyKind, setStoryKind] = useState<'image' | 'video'>('image');
  const [storyTone, setStoryTone] = useState('normal');
  const [placeTag, setPlaceTag] = useState<string | null>(null);
  const [placeBusy, setPlaceBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [deviceContacts, setDeviceContacts] = useState<DeviceContact[] | null>(null);
  const [contactsBusy, setContactsBusy] = useState(false);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [cameraOpen, setCameraOpen] = useState<null | 'create' | 'story'>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [cameraReady, setCameraReady] = useState(false);
  const [notifMsg, setNotifMsg] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({ ana: 'matcha run later? 🍵', leo: 'new drop friday 🎧' });
  const [noteDraft, setNoteDraft] = useState('');
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteSongs, setNoteSongs] = useState<Record<string, string>>({});
  const [noteModal, setNoteModal] = useState<string | null>(null);
  const [noteHint, setNoteHint] = useState('');
  const [audioOpen, setAudioOpen] = useState(false);
  const [audioQuery, setAudioQuery] = useState('');
  const [audioTab, setAudioTab] = useState<'foryou' | 'trending' | 'saved'>('foryou');
  const [savedSongs, setSavedSongs] = useState<Set<string>>(new Set());

  const flashNoteHint = useCallback((msg: string) => {
    setNoteHint(msg);
    setTimeout(() => setNoteHint(''), 2200);
  }, []);
  const noteModalAnim = useRef(new Animated.Value(0)).current;

  const openNote = useCallback(
    (username: string) => {
      tap();
      setNoteDraft(username === ME ? notes[ME] ?? '' : '');
      setNoteModal(username);
      Animated.spring(noteModalAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 22,
        stiffness: 300,
      }).start();
    },
    [notes, noteModalAnim],
  );

  const closeNote = useCallback(() => {
    Animated.timing(noteModalAnim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() =>
      setNoteModal(null),
    );
  }, [noteModalAnim]);

  const saveNote = useCallback(() => {
    const t = noteDraft.trim().slice(0, 60);
    setNotes((prev) => {
      if (!t) {
        const next = { ...prev };
        delete next[ME];
        return next;
      }
      return { ...prev, [ME]: t };
    });
    if (!t) {
      setNoteSongs((prev) => {
        const next = { ...prev };
        delete next[ME];
        return next;
      });
    }
    closeNote();
  }, [noteDraft, closeNote]);
  const [dmFilter, setDmFilter] = useState<'all' | 'unread'>('all');
  const [dmTab, setDmTab] = useState<'messages' | 'requests'>('messages');
  const [exploreCols, setExploreCols] = useState<2 | 3>(3);
  const [followList, setFollowList] = useState<{ title: string; users: string[] } | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const reelsRef = useRef<FlatList<Post>>(null);

  const refreshExtraPerms = useCallback(async () => {
    const [location, contacts, notifications, mic] = await Promise.all([
      locationStatus(),
      contactsStatus(),
      notificationsStatus(),
      Camera.getMicrophonePermissionsAsync().catch(() => ({ status: 'undetermined', granted: false })),
    ]);
    setExtraPerms({ location, contacts, notifications });
    setMicPerm({ status: mic.status, granted: mic.granted });
  }, []);

  useEffect(() => {
    if (settingsOpen && settingsPage === 'permissions') {
      refreshExtraPerms();
    }
  }, [settingsOpen, settingsPage, refreshExtraPerms]);

  const [hydrated, setHydrated] = useState(false);
  const [readThreads, setReadThreads] = useState<Set<string>>(new Set());
  const [seenActivityAt, setSeenActivityAt] = useState(0);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [customStory, setCustomStory] = useState<{ username: string; images: string[] } | null>(null);
  const [loginSessions, setLoginSessions] = useState(LOGIN_ACTIVITY);
  const [confirmClear, setConfirmClear] = useState(false);
  const [photoMsg, setPhotoMsg] = useState('');
  const [cameraErr, setCameraErr] = useState('');
  const [burstPostId, setBurstPostId] = useState<string | null>(null);
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstAnim = useRef(new Animated.Value(0)).current;
  const storyProgress = useRef(new Animated.Value(0)).current;
  useEffect(() => () => {
    if (burstTimer.current) clearTimeout(burstTimer.current);
  }, []);
  const storeRef = useRef(createPersistence(AsyncStorage));
  const [fontsLoaded] = useFonts({ GrandHotel_400Regular });

  useEffect(() => {
    (async () => {
      const saved = await storeRef.current.load();
      if (saved && saved.users.some((u) => u.username === ME)) {
        setUsers(saved.users);
        setPosts(saved.posts);
        setStories(normalizeStories(saved.stories));
        setMessages(saved.messages);
        setFollows(saved.follows);
        setBookmarks(new Set(saved.bookmarks));
        setInvited(new Set(saved.invited));
        setSettings({ ...DEFAULT_SETTINGS, ...saved.settings });
        setReadThreads(new Set(saved.readThreads));
        setSeenActivityAt(saved.seenActivityAt);
        setSearchHistory(saved.searchHistory);
        if (saved.circles && saved.circles.length > 0) setCircles(saved.circles);
        if (saved.activeCircleId !== undefined) setActiveCircleId(saved.activeCircleId ?? null);
      }
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      storeRef.current.save({
        version: STORAGE_VERSION,
        users,
        posts,
        stories,
        messages,
        follows,
        bookmarks: [...bookmarks],
        invited: [...invited],
        settings,
        readThreads: [...readThreads],
        seenActivityAt,
        searchHistory,
        circles,
        activeCircleId,
      });
    }, 500);
    return () => clearTimeout(t);
  }, [hydrated, users, posts, stories, messages, follows, bookmarks, invited, settings, readThreads, seenActivityAt, searchHistory, circles, activeCircleId]);

  const resetAll = useCallback(async () => {
    await storeRef.current.clear();
    setUsers(SEED_USERS);
    setPosts(SEED_POSTS);
    setStories(SEED_STORIES);
    setMessages(SEED_MESSAGES);
    setFollows(SEED_FOLLOWS);
    setBookmarks(seedBookmarks());
    setInvited(new Set());
    setSettings(DEFAULT_SETTINGS);
    setReadThreads(new Set());
    setSeenActivityAt(0);
    setSearchHistory([]);
    setActiveCollection(null);
    setConfirmClear(false);
    setCircles(DEFAULT_CIRCLES);
    setActiveCircleId(null);
  }, []);

  const changeAvatar = useCallback(async () => {
    const photo = await pickFromLibrary();
    if (photo) {
      setUsers((prev) => prev.map((u) => (u.username === ME ? { ...u, avatar: photo.uri } : u)));
    }
  }, []);

  const capture = useCallback(async () => {
    setCameraErr('');
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.8 });
      if (photo?.uri) {
        tap();
        if (cameraOpen === 'story') {
          setStoryUri(photo.uri);
          setStoryKind('image');
          setComposerOpen(true);
        } else {
          setPickedUri(photo.uri);
          setPickedKind('image');
          setCreateOpen(true);
        }
        setCameraOpen(null);
      }
    } catch {
      setCameraErr('Could not take the photo. Try again.');
    }
  }, [cameraOpen]);

  useEffect(() => {
    if (cameraOpen) {
      setCameraReady(false);
      setCameraErr('');
    }
  }, [cameraOpen]);

  useEffect(() => {
    if (activeChat) {
      setReadThreads((prev) => (prev.has(activeChat) ? prev : new Set(prev).add(activeChat)));
    }
  }, [activeChat]);

  useEffect(() => {
    if (activityOpen) {
      setSeenActivityAt(Date.now());
    }
  }, [activityOpen]);

  const rememberSearch = useCallback((entry: string) => {
    const e = entry.trim();
    if (!e) return;
    setSearchHistory((prev) => [e, ...prev.filter((x) => x !== e)].slice(0, 10));
  }, []);

  const openProfile = useCallback(
    (username: string, remember?: string) => {
      if (remember) rememberSearch(remember);
      setProfileName(username);
    },
    [rememberSearch],
  );

  const importContacts = useCallback(async () => {
    setContactsBusy(true);
    const list = await loadDeviceContacts();
    setDeviceContacts(list ?? []);
    setContactsBusy(false);
    refreshExtraPerms();
  }, [refreshExtraPerms]);

  const tagPlace = useCallback(async () => {
    setPlaceBusy(true);
    const place = await currentPlace();
    setPlaceTag(place);
    setPlaceBusy(false);
    refreshExtraPerms();
  }, [refreshExtraPerms]);

  const me = userByName(users, ME);
  const systemDark = useColorScheme() === 'dark';
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark);
  const C = applyTheme(dark ? 'dark' : 'light');
  const myFollowing = useMemo(() => follows[ME] ?? [], [follows]);
  const myFollowers = useMemo(
    () => Object.entries(follows).filter(([, v]) => v.includes(ME)).map(([k]) => k),
    [follows],
  );
  const activity = useMemo(
    () => buildActivity(posts, follows, ME).filter((a) => !settings.blocked.includes(a.actor)),
    [posts, follows, settings.blocked],
  );
  const activeCircle = useMemo(
    () => circleById(circles, activeCircleId),
    [circles, activeCircleId],
  );
  const myCircles = useMemo(() => circlesForUser(circles, ME), [circles]);
  const visiblePosts = useMemo(() => {
    const unblocked = posts.filter((p) => !settings.blocked.includes(p.username));
    return feedForCircle(unblocked, activeCircle);
  }, [posts, settings.blocked, activeCircle]);
  const filteredUsers = useMemo(
    () => searchUsers(users, query, undefined).filter((u) => !settings.blocked.includes(u.username)),
    [users, query, settings.blocked],
  );
  const filteredPosts = useMemo(() => searchPosts(visiblePosts, query), [visiblePosts, query]);
  const reelsPosts = useMemo(
    () => (reelsFriendsOnly ? filteredPosts.filter((p) => myFollowing.includes(p.username)) : filteredPosts),
    [filteredPosts, reelsFriendsOnly, myFollowing],
  );
  const commentsPost = posts.find((p) => p.id === commentsPostId) ?? null;
  const chatMessages = useMemo(
    () => (activeChat ? conversationWith(messages, ME, activeChat) : []),
    [messages, activeChat],
  );
  const threads = useMemo(
    () => inboxThreads(messages, ME).filter((t) => !settings.blocked.includes(t.other)),
    [messages, settings.blocked],
  );
  const unreadCount = useMemo(
    () => threads.filter((t) => t.last.from !== ME && !readThreads.has(t.other)).length,
    [threads, readThreads],
  );
  const hasNewActivity = useMemo(
    () => activity.some((a) => a.createdAt > seenActivityAt),
    [activity, seenActivityAt],
  );

  useEffect(() => {
    if (tab === 'reels') {
      const safeIndex = Math.max(0, Math.min(reelIndex, Math.max(reelsPosts.length - 1, 0)));
      const t = setTimeout(() => {
        try {
          reelsRef.current?.scrollToIndex({ index: safeIndex, animated: false });
        } catch {
          // Variable content can defeat the layout estimate; user can swipe.
        }
      }, 100);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [tab, reelIndex, reelsPosts.length]);

  const toggleLike = useCallback(
    (id: string) => {
      tap();
      const target = posts.find((p) => p.id === id);
      if (target && !target.likes.includes(ME)) {
        setBurstPostId(id);
        burstAnim.setValue(0);
        Animated.timing(burstAnim, { toValue: 1, duration: 650, useNativeDriver: true }).start();
        if (burstTimer.current) clearTimeout(burstTimer.current);
        burstTimer.current = setTimeout(() => setBurstPostId((cur) => (cur === id ? null : cur)), 650);
      }
      setPosts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, likes: toggleInList(p.likes, ME) } : p)),
      );
    },
    [posts],
  );

  const toggleBookmark = useCallback((id: string) => {
    tap();
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleFollow = useCallback((username: string) => {
    tap();
    setFollows((prev) => {
      const mine = prev[ME] ?? [];
      return { ...prev, [ME]: toggleInList(mine, username) };
    });
  }, []);

  const openStory = useCallback((index: number) => {
    setStoryPage(0);
    setStoryIndex(index);
  }, []);

  const markSeen = useCallback((username: string) => {
    setStories((prev) => prev.map((s) => (s.username === username ? { ...s, seen: true } : s)));
  }, []);

  const addComment = useCallback(() => {
    const text = draftComment.trim();
    if (!text || !commentsPostId) return;
    tap();
    setPosts((prev) =>
      prev.map((p) =>
        p.id === commentsPostId
          ? {
              ...p,
              comments: [
                ...p.comments,
                { id: `${p.id}-c${Date.now()}`, username: ME, text, createdAt: Date.now() },
              ],
            }
          : p,
      ),
    );
    setDraftComment('');
  }, [draftComment, commentsPostId]);

  const sendMessage = useCallback(() => {
    const text = draftMessage.trim();
    if (!text || !activeChat) return;
    tap();
    setMessages((prev) => [
      ...prev,
      { id: `m${Date.now()}`, from: ME, to: activeChat, text, createdAt: Date.now() },
    ]);
    setDraftMessage('');
  }, [draftMessage, activeChat]);

  const publishPost = useCallback(() => {
    const id = `p${Date.now()}`;
    success();
    const base = createCaption.trim();
    const caption = placeTag ? `${base} — at ${placeTag}` : base;
    const kind = pickedUri ? pickedKind : 'image';
    setPosts((prev) => [
      {
        id,
        username: ME,
        image: pickedUri ?? createPhoto(createSeed),
        caption,
        likes: [],
        comments: [],
        createdAt: Date.now(),
        kind,
        tone: createTone === 'normal' ? undefined : createTone,
      },
      ...prev,
    ]);
    setCreateCaption('');
    setPickedUri(null);
    setPickedKind('image');
    setCreateTone('normal');
    setPlaceTag(null);
    setSaveMsg('');
    setCreateOpen(false);
    setTab(kind === 'video' ? 'reels' : 'home');
  }, [createCaption, createSeed, pickedUri, pickedKind, createTone, placeTag]);

  const saveBio = useCallback(() => {
    const bio = bioDraft.trim();
    if (bio) setUsers((prev) => prev.map((u) => (u.username === ME ? { ...u, bio } : u)));
    setEditingBio(false);
  }, [bioDraft]);

  const orderedStories = useMemo(() => {
    const visible = stories.filter((g) => !settings.blocked.includes(g.username));
    const mineIdx = visible.findIndex((g) => g.username === ME);
    const sorted = [...visible].sort((a, b) => Number(a.seen) - Number(b.seen));
    if (mineIdx > -1) {
      const at = sorted.findIndex((g) => g.username === ME);
      if (at > 0) {
        const [self] = sorted.splice(at, 1);
        sorted.unshift(self);
      }
    }
    return sorted;
  }, [stories, settings.blocked, settings.muted]);

  const CaptionText = ({ text, username }: { text: string; username: string }) => (
    <Text style={styles.caption} numberOfLines={2}>
      <Text style={styles.postUser}>{username} </Text>
      {text.split(/(\s+)/).map((w, i) =>
        w.startsWith('#') && w.length > 1 ? (
          <Text
            key={i}
            style={styles.tag}
            onPress={() => {
              rememberSearch(w.toLowerCase());
              setTagView(w.toLowerCase());
            }}>
            {w}
          </Text>
        ) : (
          <Text key={i}>{w}</Text>
        ),
      )}
    </Text>
  );

  const archivePost = useCallback((id: string) => {
    setSettings((prev) =>
      prev.archived.includes(id) ? prev : { ...prev, archived: [...prev.archived, id] },
    );
    setOptionsPostId(null);
  }, []);

  const unarchivePost = useCallback((id: string) => {
    setSettings((prev) => ({ ...prev, archived: prev.archived.filter((a) => a !== id) }));
  }, []);

  const deletePost = useCallback((id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
    setOptionsPostId(null);
  }, []);

  const acceptRequest = useCallback((username: string) => {
    setSettings((prev) => ({
      ...prev,
      followRequests: prev.followRequests.filter((r) => r !== username),
    }));
    setFollows((prev) => ({ ...prev, [username]: [...(prev[username] ?? []), ME] }));
  }, []);

  const declineRequest = useCallback((username: string) => {
    setSettings((prev) => ({
      ...prev,
      followRequests: prev.followRequests.filter((r) => r !== username),
    }));
  }, []);

  const pushStoryMedia = useCallback((items: { uri: string; kind: 'image' | 'video'; tone?: string }[]) => {
    if (items.length === 0) return;
    success();
    setStories((prev) => {
      const mine = prev.find((s) => s.username === ME);
      if (mine) {
        const mineMedia = storyMedia(mine);
        return prev.map((s) =>
          s.username === ME
            ? { ...s, images: [...items.map((i) => i.uri), ...s.images], media: [...items, ...mineMedia], seen: false }
            : s,
        );
      }
      return [
        { username: ME, images: items.map((i) => i.uri), media: items, seen: false },
        ...prev,
      ];
    });
  }, []);

  const addStory = useCallback(() => {
    const uri = storyUri ?? `https://picsum.photos/seed/${storySeed}/540/960`;
    pushStoryMedia([
      { uri, kind: storyUri ? storyKind : 'image', tone: storyTone === 'normal' ? undefined : storyTone },
    ]);
    setStoryUri(null);
    setStoryKind('image');
    setStoryTone('normal');
    setComposerOpen(false);
  }, [storySeed, storyUri, storyKind, storyTone, pushStoryMedia]);

  const addHighlight = useCallback(() => {
    const name = highlightName.trim();
    if (!name) return;
    const mine = stories.find((s) => s.username === ME);
    setSettings((prev) => ({
      ...prev,
      highlights: [...prev.highlights, { name, images: mine?.images.slice(0, 3) ?? [] }],
    }));
    setHighlightName('');
  }, [highlightName, stories]);

  const addToCollection = useCallback(
    (collection: string) => {
      if (!collectPostId) return;
      const pid = collectPostId;
      setSettings((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.name === collection && !c.ids.includes(pid)
            ? { ...c, ids: [...c.ids, pid] }
            : c,
        ),
      }));
      setBookmarks((prev) => new Set(prev).add(pid));
      setCollectPostId(null);
    },
    [collectPostId],
  );

  const createCollection = useCallback(() => {
    const name = newCollection.trim();
    if (!name) return;
    setSettings((prev) =>
      prev.collections.some((c) => c.name === name)
        ? prev
        : { ...prev, collections: [...prev.collections, { name, ids: [] }] },
    );
    setNewCollection('');
  }, [newCollection]);

  const changePassword = useCallback(() => {
    if (pw1.length < 6) {
      setPwMsg('Password must be at least 6 characters.');
      return;
    }
    if (pw1 !== pw2) {
      setPwMsg('Passwords do not match.');
      return;
    }
    patchSettings({ passwordUpdatedAt: Date.now() });
    setPw1('');
    setPw2('');
    setPwMsg('Password updated.');
  }, [pw1, pw2, patchSettings]);

  const renderPost = ({ item }: { item: Post }) => {
    const author = userByName(users, item.username);
    const liked = item.likes.includes(ME);
    const authorCircle = circles.find((c) => c.members.includes(item.username));
    return (
      <View style={styles.post}>
        <View style={styles.postHeader}>
          <Pressable
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
            onPress={() => setProfileName(item.username)}>
            <Avatar uri={author.avatar} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={styles.postUser}>{item.username}</Text>
              <Text style={styles.postMeta} numberOfLines={1}>
                {item.sponsored ? 'Sponsored' : authorCircle ? `${authorCircle.name} · ` : ''}
                {!item.sponsored ? timeAgo(item.createdAt) : ''}
              </Text>
            </View>
          </Pressable>
          <Pressable onPress={() => setOptionsPostId(item.id)} hitSlop={8}>
            <MaterialCommunityIcons name="dots-horizontal" size={20} color={C.text} />
          </Pressable>
        </View>
        <Pressable onPress={() => toggleLike(item.id)}>
          {item.kind === 'video' ? (
            <AutoVideo uri={item.image} style={styles.postImage} />
          ) : (
            <Image
              source={{ uri: item.image }}
              style={styles.postImage}
              placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
              contentFit="cover"
              transition={200}
            />
          )}
          {item.tone ? (
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: toneOverlay(item.tone) }]}
            />
          ) : null}
          {item.productTags?.map((t, i) => {
            const key = `${item.id}:${i}`;
            const open = shopTag === key;
            return (
              <View key={key} style={{ position: 'absolute', left: `${t.x}%`, top: `${t.y}%` }}>
                <Pressable
                  style={styles.shopDot}
                  hitSlop={10}
                  accessibilityLabel={`View ${t.label}`}
                  accessibilityRole="button"
                  onPress={() => {
                    tap();
                    setShopTag(open ? null : key);
                  }}>
                  <View style={styles.shopDotInner} />
                </Pressable>
                {open ? (
                  <View style={styles.shopCard}>
                    <Text style={styles.shopLabel}>{t.label}</Text>
                    <Text style={styles.shopPrice}>{t.price}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
          {burstPostId === item.id ? (
            <Animated.View
              style={[
                styles.burstWrap,
                { opacity: burstAnim.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] }) },
              ]}
              pointerEvents="none">
              <Animated.View
                style={{
                  transform: [
                    { scale: burstAnim.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0.2, 1.2, 1] }) },
                  ],
                }}>
                <MaterialCommunityIcons name="heart" size={88} color="#fff" />
              </Animated.View>
            </Animated.View>
          ) : null}
        </Pressable>
        <View style={styles.postActions}>
          <IconBtn
            icon={liked ? 'heart' : 'heart-outline'}
            label={liked ? 'Unlike post' : 'Like post'}
            selected={liked}
            size={28}
            onPress={() => toggleLike(item.id)}
            color={liked ? C.like : C.text}
          />
          <IconBtn icon="comment-outline" label="View comments" size={28} onPress={() => setCommentsPostId(item.id)} />
          <IconBtn
            icon="send-outline"
            label="Share to Direct"
            size={28}
            onPress={() => {
              setTab('direct');
              setActiveChat(item.username === ME ? 'ana' : item.username);
            }}
          />
          <View style={{ flex: 1 }} />
          <IconBtn
            icon={bookmarks.has(item.id) ? 'bookmark' : 'bookmark-outline'}
            label={bookmarks.has(item.id) ? 'Remove bookmark' : 'Save post'}
            selected={bookmarks.has(item.id)}
            size={28}
            onPress={() => toggleBookmark(item.id)}
          />
        </View>
        <Text style={styles.likes}>
          {item.likes.length} {item.likes.length === 1 ? 'like' : 'likes'}
        </Text>
        <CaptionText text={item.caption} username={item.username} />
        <Pressable onPress={() => setCommentsPostId(item.id)}>
          <Text style={styles.meta}>
            View all {item.comments.length} comments · {timeAgo(item.createdAt)}
          </Text>
        </Pressable>
      </View>
    );
  };

  const profileUser = profileName ? userByName(users, profileName) : null;
  const myPosts = posts.filter((p) => p.username === ME);
  const savedPosts = posts.filter((p) => bookmarks.has(p.id));
  const shownProfilePosts = profileUser
    ? posts.filter((p) => p.username === profileUser.username)
    : [];
  const profileBlocked = profileUser
    ? profileUser.username !== ME && settings.blocked.includes(profileUser.username)
    : false;

  const storyGroup = storyIndex !== null ? orderedStories[storyIndex] : null;
  const viewer = customStory ?? storyGroup;
  const viewerMedia = useMemo(() => (viewer ? storyMedia(viewer) : []), [viewer]);
  const viewerImages = viewerMedia.map((m) => m.uri);
  const viewerName = viewer ? viewer.username : '';
  const viewerItem = viewerMedia.length > 0 ? viewerMedia[storyPage % viewerMedia.length] : null;
  const closeStory = () => {
    setStoryIndex(null);
    setCustomStory(null);
    setStoryReply('');
  };
  const sendStoryReply = () => {
    const t = storyReply.trim();
    if (!t || !viewer) return;
    tap();
    setMessages((prev) => [
      ...prev,
      { id: `m${Date.now()}`, from: ME, to: viewer.username, text: t, createdAt: Date.now() },
    ]);
    setStoryReply('');
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (cameraOpen) { setCameraOpen(null); return true; }
      if (viewer) { closeStory(); return true; }
      if (commentsPostId) { setCommentsPostId(null); return true; }
      if (optionsPostId) { setOptionsPostId(null); return true; }
      if (collectPostId) { setCollectPostId(null); return true; }
      if (tagView) { setTagView(null); return true; }
      if (composerOpen) { setComposerOpen(false); return true; }
      if (profileOptions) { setProfileOptions(false); return true; }
      if (callState) { setCallState(null); return true; }
      if (convOptions) { setConvOptions(false); return true; }
      if (settingsOpen) {
        if (settingsPage) setSettingsPage(null);
        else setSettingsOpen(false);
        return true;
      }
      if (createOpen) { setCreateOpen(false); return true; }
      if (activityOpen) { setActivityOpen(false); return true; }
      if (activeChat) { setActiveChat(null); return true; }
      if (profileName) { setProfileName(null); return true; }
      if (tab !== 'home') { setTab('home'); return true; }
      return false;
    });
    return () => sub.remove();
  });

  useEffect(() => {
    if (!viewer) return undefined;
    storyProgress.setValue(0);
    const anim = Animated.timing(storyProgress, { toValue: 1, duration: 5000, useNativeDriver: false });
    anim.start(({ finished }) => {
      if (finished) {
        if (storyPage + 1 < viewerImages.length) setStoryPage(storyPage + 1);
        else closeStory();
      }
    });
    return () => anim.stop();
  }, [viewer, storyPage, viewerImages.length]);

  if (!hydrated || !fontsLoaded) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <View style={{ alignItems: 'center', paddingTop: 32 }}>
          <Text style={styles.bootLogo}>Circles</Text>
          <Text style={styles.muted}>private moments with your people</Text>
        </View>
        <BootSkeleton />
      </SafeAreaView>
    );
  }

  const immersive = viewer !== null || cameraOpen !== null || callState !== null || tab === 'reels';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StatusBar style={immersive || dark ? 'light' : 'dark'} />

      {/* Header — hidden on immersive tabs */}
      {((tab === 'reels' || tab === 'search') && !activeChat && !profileUser) ? null : (
      <View style={styles.header}>
        {activeChat || profileUser || createOpen || activityOpen ? (
          <Pressable
            hitSlop={8}
            accessibilityLabel="Back"
            accessibilityRole="button"
            onPress={() => {
              if (activeChat) setActiveChat(null);
              else if (profileUser) setProfileName(null);
              else if (createOpen) setCreateOpen(false);
              else setActivityOpen(false);
            }}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={C.text} />
          </Pressable>
        ) : tab === 'home' ? (
          <IconBtn icon="plus-box-outline" label="Create post" size={30} onPress={() => setCreateOpen(true)} />
        ) : null}
        {activeChat || profileUser || tab === 'profile' || tab === 'direct' || createOpen || activityOpen ? (
          tab === 'direct' && !activeChat && !profileUser && !createOpen && !activityOpen ? (
            <Pressable
              style={styles.feedSwitcher}
              accessibilityLabel="Open your profile"
              accessibilityRole="button"
              onPress={() => setTab('profile')}>
              {settings.privateAccount ? (
                <MaterialCommunityIcons name="lock-outline" size={16} color={C.text} />
              ) : null}
              <Text style={styles.headerTitle}>{me.username}</Text>
              <MaterialCommunityIcons name="chevron-down" size={20} color={C.text} />
            </Pressable>
          ) : tab === 'profile' && !profileUser && !createOpen && !activityOpen ? (
            <View style={[styles.feedSwitcher, { gap: 6 }]}>
              {settings.privateAccount ? (
                <MaterialCommunityIcons name="lock-outline" size={16} color={C.text} />
              ) : null}
              <Text style={styles.headerTitle}>{me.username}</Text>
            </View>
          ) : (
            <Text style={styles.headerTitle}>
              {activeChat
                ? ''
                : (profileUser?.username ?? (createOpen
                    ? 'New moment'
                    : activityOpen
                      ? 'Activity'
                      : me.username))}
            </Text>
          )
        ) : tab === 'home' ? (
          <Pressable
            style={styles.feedSwitcher}
            accessibilityLabel={activeCircle ? `Feed: ${activeCircle.name}` : 'Feed: all circles'}
            accessibilityRole="button"
            accessibilityState={{ expanded: circleMenuOpen }}
            onPress={toggleCircleMenu}>
            <Text style={styles.feedSwitcherTxt}>
              {activeCircle ? activeCircle.name : 'All circles'}
            </Text>
            <MaterialCommunityIcons
              name={circleMenuOpen ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={C.text}
            />
          </Pressable>
        ) : (
          <Text style={styles.logo}>Circles</Text>
        )}
        {!activeChat && !profileUser && !createOpen && !activityOpen ? (
          <View style={styles.headerIcons}>
            {tab === 'home' ? (
              <Pressable
                onPress={() => setActivityOpen(true)}
                hitSlop={8}
                accessibilityLabel={hasNewActivity ? 'Activity, new updates' : 'Activity'}
                accessibilityRole="button">
                <View>
                  <MaterialCommunityIcons
                    name={hasNewActivity ? 'heart' : 'heart-outline'}
                    size={ICON_SIZE}
                    color={hasNewActivity ? C.like : C.text}
                  />
                  {hasNewActivity ? <View style={styles.badgeDot} /> : null}
                </View>
              </Pressable>
            ) : null}
            {tab === 'profile' ? (
              <>
                <IconBtn
                  icon="plus-box-outline"
                  label="Create post"
                  size={28}
                  onPress={() => setCreateOpen(true)}
                />
                <IconBtn
                  icon="menu"
                  label="Settings"
                  onPress={() => {
                    setSettingsPage(null);
                    setSettingsOpen(true);
                  }}
                />
              </>
            ) : null}
            {tab === 'direct' ? (
              <IconBtn
                icon="square-edit-outline"
                label="New message"
                size={27}
                onPress={() => {
                  tap();
                  setFollowList({
                    title: 'New message',
                    users: users.filter((u) => u.username !== ME).map((u) => u.username),
                  });
                }}
              />
            ) : null}
          </View>
        ) : profileUser ? (
          <View style={styles.headerIcons}>
            <IconBtn icon="dots-horizontal" label="Profile options" onPress={() => setProfileOptions(true)} />
          </View>
        ) : (
          <View style={{ width: 28 }} />
        )}
      </View>
      )}
      {circleMenuOpen && tab === 'home' && !activeChat && !profileUser && !createOpen && !activityOpen ? (
        <View style={styles.feedMenuWrap} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={toggleCircleMenu} accessibilityLabel="Close feed menu" />
          <Animated.View
            style={[
              styles.feedMenu,
              {
                opacity: circleMenuAnim,
                transform: [
                  { scale: circleMenuAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
                  { translateY: circleMenuAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
                ],
              },
            ]}>
            <Pressable
              style={styles.circleOption}
              accessibilityLabel="Show all circles"
              accessibilityRole="button"
              onPress={() => pickCircle(null)}>
              <MaterialCommunityIcons name="earth" size={22} color={C.text} />
              <Text style={styles.circleOptionTxt}>All circles</Text>
              {!activeCircleId ? <MaterialCommunityIcons name="check" size={20} color={C.accent} /> : null}
            </Pressable>
            {myCircles.map((c) => {
              const on = activeCircleId === c.id;
              return (
                <Pressable
                  key={c.id}
                  style={styles.circleOption}
                  accessibilityLabel={`Show ${c.name}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => pickCircle(on ? null : c.id)}>
                  <MaterialCommunityIcons name="account-group-outline" size={22} color={C.text} />
                  <Text style={styles.circleOptionTxt}>{c.name}</Text>
                  {on ? <MaterialCommunityIcons name="check" size={20} color={C.accent} /> : null}
                </Pressable>
              );
            })}
          </Animated.View>
        </View>
      ) : null}

      {/* Direct inbox */}
      {tab === 'direct' && !activeChat ? (
        <FlatList
          data={dmTab === 'requests' ? [] : dmFilter === 'unread' ? threads.filter((t) => t.last.from !== ME && !readThreads.has(t.other)) : threads}
          keyExtractor={(t) => t.other}
          contentContainerStyle={{ paddingBottom: 140 }}
          ListHeaderComponent={
            <View>
              <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
                <View style={styles.searchField}>
                  <MaterialCommunityIcons name="magnify" size={18} color={C.muted} />
                  <TextInput
                    placeholder="Search or ask Meta AI"
                    placeholderTextColor={C.muted}
                    style={styles.searchInput}
                    autoCapitalize="none"
                  />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 4 }}>
                {(['all', 'unread'] as const).map((f) => {
                  const on = dmFilter === f;
                  return (
                    <Pressable
                      key={f}
                      style={[styles.chip, on && { backgroundColor: '#0095F6', borderColor: '#0095F6' }]}
                      accessibilityLabel={f === 'all' ? 'Show all chats' : 'Show unread chats'}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => setDmFilter(f)}>
                      <Text style={[styles.chipTxt, on && { color: '#fff', fontWeight: '700' }]}>
                        {f === 'all' ? 'All' : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.dmTabs}>
                <Pressable onPress={() => setDmTab('messages')}>
                  <Text style={[styles.dmTab, dmTab === 'messages' && styles.dmTabOn]}>Messages</Text>
                </Pressable>
                <Pressable onPress={() => setDmTab('requests')}>
                  <Text style={[styles.dmTab, { color: '#0095F6' }]}>
                    Requests{settings.followRequests.length > 0 ? ` (${settings.followRequests.length})` : ''}
                  </Text>
                </Pressable>
              </View>
              {dmTab === 'requests' ? (
                <View style={{ paddingBottom: 8 }}>
                  {settings.followRequests.length === 0 ? (
                    <Text style={[styles.muted, { paddingHorizontal: 16 }]}>No message requests.</Text>
                  ) : (
                    settings.followRequests.map((r) => (
                      <View key={r} style={styles.thread}>
                        <Avatar uri={userByName(users, r).avatar} size={44} />
                        <Text style={[styles.postUser, { flex: 1 }]}>{r}</Text>
                        <Pressable style={styles.reqBtn} onPress={() => acceptRequest(r)}>
                          <Text style={styles.publishTxt}>Accept</Text>
                        </Pressable>
                        <Pressable style={styles.secondary} onPress={() => declineRequest(r)}>
                          <Text style={styles.secondaryTxt}>Decline</Text>
                        </Pressable>
                      </View>
                    ))
                  )}
                </View>
              ) : null}
              {dmTab === 'messages' ? (
              <View style={{ paddingHorizontal: 12 }}>
                <Text style={styles.sectionTitle}>Notes</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <Pressable
                  style={styles.noteCell}
                  accessibilityLabel={notes[ME] ? 'Edit your note' : 'Leave a note'}
                  accessibilityRole="button"
                  onPress={() => openNote(ME)}>
                  <View style={styles.noteBubble}>
                    <Text style={styles.noteText} numberOfLines={2}>
                      {notes[ME] ?? 'Leave a note'}
                    </Text>
                    {noteSongs[ME] ? (
                      <Text style={styles.noteSong} numberOfLines={1}>
                        🎵 {noteSongs[ME]}
                      </Text>
                    ) : null}
                  </View>
                  <Avatar uri={me.avatar} size={44} />
                  <Text style={styles.storyName} numberOfLines={1}>
                    Your note
                  </Text>
                </Pressable>
                {Object.entries(notes)
                  .filter(([u]) => u !== ME && !settings.blocked.includes(u))
                  .map(([u, text]) => (
                    <Pressable
                      key={u}
                      style={styles.noteCell}
                      accessibilityLabel={`Note from ${u}`}
                      accessibilityRole="button"
                      onPress={() => openNote(u)}>
                      <View style={styles.noteBubble}>
                        <Text style={styles.noteText} numberOfLines={2}>
                          {text}
                        </Text>
                        {noteSongs[u] ? (
                          <Text style={styles.noteSong} numberOfLines={1}>
                            🎵 {noteSongs[u]}
                          </Text>
                        ) : null}
                      </View>
                      <Avatar uri={userByName(users, u).avatar} size={44} />
                      <Text style={styles.storyName} numberOfLines={1}>
                        {u}
                      </Text>
                    </Pressable>
                  ))}
              </ScrollView>
              {noteEditing ? (
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <TextInput
                    value={noteDraft}
                    onChangeText={setNoteDraft}
                    placeholder="Share a thought (60 chars)"
                    maxLength={60}
                    style={[styles.input, { flex: 1 }]}
                    onSubmitEditing={() => {
                      const t = noteDraft.trim();
                      setNotes((prev) => {
                        if (!t) {
                          const next = { ...prev };
                          delete next[ME];
                          return next;
                        }
                        return { ...prev, [ME]: t };
                      });
                      setNoteEditing(false);
                    }}
                    returnKeyType="done"
                  />
                  <Pressable
                    style={styles.publish}
                    accessibilityLabel="Share note"
                    accessibilityRole="button"
                    onPress={() => {
                      tap();
                      const t = noteDraft.trim();
                      setNotes((prev) => {
                        if (!t) {
                          const next = { ...prev };
                          delete next[ME];
                          return next;
                        }
                        return { ...prev, [ME]: t };
                      });
                      setNoteEditing(false);
                    }}>
                    <Text style={styles.publishTxt}>Share</Text>
                  </Pressable>
                </View>
              ) : null}
              <Text style={styles.sectionTitle}>Contacts</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {users
                  .filter((u) => u.username !== ME && !settings.blocked.includes(u.username))
                  .map((u) => (
                    <Pressable
                      key={u.username}
                      style={styles.contactChip}
                      onPress={() => setActiveChat(u.username)}>
                      <Avatar uri={u.avatar} size={40} />
                      <Text style={styles.chipName}>{u.username}</Text>
                    </Pressable>
                  ))}
               </ScrollView>
              </View>
              ) : null}
            </View>
           }
           renderItem={({ item }) => {
            const u = userByName(users, item.other);
            const unread = item.last.from !== ME && !readThreads.has(item.other);
            return (
              <Pressable style={styles.dmThread} onPress={() => setActiveChat(item.other)}>
                <View>
                  <Avatar uri={u.avatar} size={56} />
                  <View style={styles.activeDot} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dmName, unread && { fontWeight: '800' }]}>{item.other}</Text>
                  <Text
                    numberOfLines={1}
                    style={[styles.dmSnippet, unread && { color: C.text, fontWeight: '600' }]}>
                    {item.last.from === ME
                      ? `Sent ${timeAgo(item.last.createdAt).toLowerCase()}`
                      : `${item.last.text} · ${timeAgo(item.last.createdAt).toLowerCase()}`}
                  </Text>
                </View>
                {unread ? (
                  item.unread > 1 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeTxt}>{item.unread}</Text>
                    </View>
                  ) : (
                    <View style={styles.unreadDot} />
                  )
                ) : null}
              </Pressable>
            );
          }}
           ListEmptyComponent={
            dmTab === 'requests' ? null : (
              <View style={styles.center}>
                <Text style={styles.muted}>No messages yet — start one from Contacts.</Text>
              </View>
            )
          }
        />
      ) : activeChat ? (
        <View style={{ flex: 1 }}>
          <View style={styles.chatHeader}>
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
              accessibilityLabel={`View ${activeChat}'s profile`}
              accessibilityRole="button"
              onPress={() => openProfile(activeChat)}>
              <Avatar uri={userByName(users, activeChat).avatar} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.chatName}>{activeChat}</Text>
                <Text style={styles.chatStatus}>Active now</Text>
              </View>
            </Pressable>
            <View style={styles.chatCallBtn}>
              <IconBtn
                icon="phone-outline"
                label="Start voice call"
                size={22}
                color={C.accent}
                onPress={() => setCallState({ with: activeChat, video: false, muted: false })}
              />
            </View>
            <View style={styles.chatCallBtn}>
              <IconBtn
                icon="video-outline"
                label="Start video call"
                size={22}
                color={C.accent}
                onPress={() => setCallState({ with: activeChat, video: true, muted: false })}
              />
            </View>
          </View>
          <FlatList
            data={chatMessages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
            ListHeaderComponent={
              chatMessages.length > 0 ? (
                <View style={{ alignItems: 'center', marginBottom: 8 }}>
                  <Text style={styles.dayPill}>Today</Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const mine = item.from === ME;
              return (
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={{ color: mine ? '#fff' : C.text }}>{item.text}</Text>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.muted}>Say hi to {activeChat} — messages stay on this device.</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {['👋 Hey!', '🔥 Love your posts', '📸 Let’s collab'].map((chip) => (
                    <Pressable
                      key={chip}
                      style={styles.chip}
                      accessibilityLabel={`Send ${chip}`}
                      accessibilityRole="button"
                      onPress={() => {
                        tap();
                        setMessages((prev) => [
                          ...prev,
                          { id: `m${Date.now()}`, from: ME, to: activeChat, text: chip, createdAt: Date.now() },
                        ]);
                      }}>
                      <Text style={styles.chipTxt}>{chip}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            }
          />
          <View style={styles.composer}>
            <TextInput
              value={draftMessage}
              onChangeText={setDraftMessage}
              placeholder="Message..."
              style={styles.input}
              onSubmitEditing={sendMessage}
              returnKeyType="send"
            />
            <Pressable
              style={styles.sendBtn}
              onPress={sendMessage}
              hitSlop={8}
              accessibilityLabel="Send message"
              accessibilityRole="button">
              <MaterialCommunityIcons name="send" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
      ) : profileUser ? (
        <ScrollView>
          <View style={styles.profileHead}>
            <Avatar uri={profileUser.avatar} size={64} />
            <View style={styles.stat}>
              <Text style={styles.statN}>{shownProfilePosts.length}</Text>
              <Text style={styles.muted}>Posts</Text>
            </View>
            <Pressable
              style={styles.stat}
              accessibilityLabel={`${profileUser.username} followers`}
              accessibilityRole="button"
              onPress={() =>
                setFollowList({
                  title: 'Followers',
                  users: Object.entries(follows)
                    .filter(([, v]) => v.includes(profileUser.username))
                    .map(([k]) => k),
                })
              }>
              <Text style={styles.statN}>
                {Object.values(follows).filter((l) => l.includes(profileUser.username)).length}
              </Text>
              <Text style={styles.muted}>Followers</Text>
            </Pressable>
            <Pressable
              style={styles.stat}
              accessibilityLabel={`${profileUser.username} following`}
              accessibilityRole="button"
              onPress={() =>
                setFollowList({ title: 'Following', users: follows[profileUser.username] ?? [] })
              }>
              <Text style={styles.statN}>{(follows[profileUser.username] ?? []).length}</Text>
              <Text style={styles.muted}>Following</Text>
            </Pressable>
          </View>
          <View style={{ paddingHorizontal: 12 }}>
            <Text style={styles.postUser}>{profileUser.name}</Text>
            <Text style={{ color: C.text, fontSize: 14 }}>{profileUser.bio}</Text>
            {profileUser.username !== ME ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Pressable
                  style={[styles.followBtn, { flex: 1 }, myFollowing.includes(profileUser.username) && styles.followingBtn]}
                  onPress={() => toggleFollow(profileUser.username)}>
                  <Text
                    style={[
                      styles.followTxt,
                      myFollowing.includes(profileUser.username) && { color: C.text },
                    ]}>
                    {myFollowing.includes(profileUser.username) ? 'Following' : 'Follow'}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.secondary, { flex: 1 }]}
                  accessibilityLabel={`Message ${profileUser.username}`}
                  accessibilityRole="button"
                  onPress={() => {
                    setTab('direct');
                    setActiveChat(profileUser.username);
                  }}>
                  <Text style={{ color: C.text, fontWeight: '600', fontSize: 14 }}>Message</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          {profileBlocked && profileUser ? (
            <View style={{ paddingHorizontal: 12 }}>
              <Text style={styles.muted}>
                You blocked @{profileUser.username}. Unblock to see their posts.
              </Text>
              <Pressable
                style={[styles.secondary, { alignSelf: 'flex-start' }]}
                accessibilityLabel={`Unblock ${profileUser.username}`}
                accessibilityRole="button"
                onPress={() => toggleSettingList('blocked', profileUser.username)}>
                <Text style={styles.secondaryTxt}>Unblock</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.grid}>
                {shownProfilePosts.map((p) => (
                  <Pressable key={p.id} onPress={() => setCommentsPostId(p.id)} style={styles.cell}>
                    <Image source={{ uri: p.image }} style={styles.cellImg} contentFit="cover" />
                  </Pressable>
                ))}
              </View>
              {shownProfilePosts.length === 0 ? (
                <View style={styles.center}>
                  <Text style={styles.muted}>@{profileUser.username} hasn't posted yet.</Text>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      ) : tab === 'home' && !createOpen && !activityOpen ? (
        <FlatList
          data={visiblePosts}
          keyExtractor={(p) => p.id}
          renderItem={renderPost}
          contentContainerStyle={{ paddingBottom: 140 }}
          ListHeaderComponent={
            <View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.storyStrip}>
              <Pressable style={styles.storyItem} onPress={() => setComposerOpen(true)}>
                <View>
                  <Avatar uri={me.avatar} size={68} ring={false} />
                  <View style={styles.storyAdd}>
                    <MaterialCommunityIcons name="plus" size={16} color="#fff" />
                  </View>
                </View>
                <Text style={styles.storyName} numberOfLines={1}>
                  Your story
                </Text>
              </Pressable>
              {orderedStories.map((item, index) => (
                <Pressable
                  key={item.username}
                  style={[styles.storyItem, settings.muted.includes(item.username) && { opacity: 0.5 }]}
                  onPress={() => {
                    openStory(index);
                    markSeen(item.username);
                  }}>
                  <Avatar
                    uri={userByName(users, item.username).avatar}
                    size={68}
                    ring={
                      item.seen
                        ? 'seen'
                        : settings.closeFriends.includes(item.username)
                          ? 'close'
                          : true
                    }
                  />
                  <Text style={styles.storyName} numberOfLines={1}>
                    {item.username}
                  </Text>
                </Pressable>
              ))}
              </ScrollView>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.muted}>
                {activeCircle ? `No moments in ${activeCircle.name} yet.` : 'No posts yet.'}
              </Text>
              <Pressable
                style={[styles.publish, { marginTop: 8 }]}
                accessibilityLabel="Create the first post"
                accessibilityRole="button"
                onPress={() => setCreateOpen(true)}>
                <Text style={styles.publishTxt}>Create the first one</Text>
              </Pressable>
            </View>
          }
        />
      ) : tab === 'reels' && !createOpen && !activityOpen ? (
        <View
          style={{ flex: 1, backgroundColor: '#000' }}
          onLayout={(e) => {
            const h = Math.round(e.nativeEvent.layout.height);
            if (h > 0 && Math.abs(h - reelH) > 2) setReelH(h);
          }}>
          <FlatList
            ref={reelsRef}
            data={reelsPosts}
            keyExtractor={(p) => p.id}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            getItemLayout={(_data, index) => ({ length: reelH, offset: reelH * index, index })}
            onScrollToIndexFailed={() => undefined}
            onViewableItemsChanged={({ viewableItems }) => {
              if (viewableItems[0]?.index != null) setReelIndex(viewableItems[0].index);
            }}
            viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
            renderItem={({ item, index }) => {
              const liked = item.likes.includes(ME);
              const reelAuthor = userByName(users, item.username);
              const authorCircle = circles.find((c) => c.members.includes(item.username));
              return (
                <View style={[styles.reel, { height: reelH }]}>
                  {item.kind === 'video' ? (
                    <AutoVideo uri={item.image} style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <Image
                      source={{ uri: item.image }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                      placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
                    />
                  )}
                  {item.tone ? (
                    <View
                      pointerEvents="none"
                      style={[StyleSheet.absoluteFill, { backgroundColor: toneOverlay(item.tone) }]}
                    />
                  ) : null}
                  <View style={styles.reelScrim} pointerEvents="none" />
                  <View style={styles.reelTop}>
                    <Pressable
                      style={{ flexDirection: 'row', alignItems: 'center' }}
                      hitSlop={8}
                      accessibilityLabel="Back to top"
                      accessibilityRole="button"
                      onPress={() => {
                        try {
                          reelsRef.current?.scrollToIndex({ index: 0, animated: true });
                        } catch {
                          setReelIndex(0);
                        }
                      }}>
                      <Text style={styles.reelTitle}>Reels</Text>
                      <MaterialCommunityIcons name="chevron-down" size={22} color="#fff" />
                    </Pressable>
                    <Pressable
                      style={[styles.reelFriends, reelsFriendsOnly && styles.reelFriendsOn]}
                      hitSlop={8}
                      accessibilityLabel="Friends-only reels"
                      accessibilityRole="button"
                      accessibilityState={{ selected: reelsFriendsOnly }}
                      onPress={() => {
                        tap();
                        setReelsFriendsOnly((v) => !v);
                        setReelIndex(0);
                      }}>
                      <View style={{ flexDirection: 'row' }}>
                        {myFollowing.slice(0, 3).map((u, i) => (
                          <Image
                            key={u}
                            source={{ uri: userByName(users, u).avatar }}
                            style={[
                              styles.reelFriendAvatar,
                              i > 0 && { marginLeft: -10 },
                            ]}
                          />
                        ))}
                      </View>
                      <Text style={styles.reelFriendsTxt}>Friends</Text>
                    </Pressable>
                    <Pressable
                      hitSlop={8}
                      accessibilityLabel="Open camera"
                      accessibilityRole="button"
                      onPress={() => setCameraOpen('story')}>
                      <MaterialCommunityIcons name="camera-outline" size={26} color="#fff" />
                    </Pressable>
                  </View>
                  <Text style={styles.reelCounter}>
                    {index + 1} / {reelsPosts.length}
                  </Text>
                  <View style={styles.reelSide}>
                    <View style={{ alignItems: 'center', gap: 4 }}>
                      <Pressable
                        style={styles.reelGlassBtn}
                        hitSlop={8}
                        accessibilityLabel={liked ? 'Unlike reel' : 'Like reel'}
                        accessibilityRole="button"
                        onPress={() => toggleLike(item.id)}>
                        <MaterialCommunityIcons
                          name={liked ? 'heart' : 'heart-outline'}
                          size={28}
                          color={liked ? '#FF3040' : '#fff'}
                        />
                      </Pressable>
                      <Text style={styles.reelCount}>{item.likes.length}</Text>
                    </View>
                    <View style={{ alignItems: 'center', gap: 4 }}>
                      <Pressable
                        style={styles.reelGlassBtn}
                        hitSlop={8}
                        accessibilityLabel="View reel comments"
                        accessibilityRole="button"
                        onPress={() => setCommentsPostId(item.id)}>
                        <MaterialCommunityIcons name="comment-outline" size={28} color="#fff" />
                      </Pressable>
                      <Text style={styles.reelCount}>{item.comments.length}</Text>
                    </View>
                    <Pressable
                      style={styles.reelGlassBtn}
                      hitSlop={8}
                      accessibilityLabel="Share reel to Direct"
                      accessibilityRole="button"
                      onPress={() => {
                        setTab('direct');
                        setActiveChat(item.username === ME ? 'ana' : item.username);
                      }}>
                      <MaterialCommunityIcons name="send-outline" size={26} color="#fff" />
                    </Pressable>
                    <View style={{ alignItems: 'center', gap: 4 }}>
                      <Pressable
                        style={styles.reelGlassBtn}
                        hitSlop={8}
                        accessibilityLabel="Send a gift"
                        accessibilityRole="button"
                        onPress={() => {
                          success();
                          setReelGifts((prev) => ({ ...prev, [item.id]: (prev[item.id] ?? 0) + 1 }));
                        }}>
                        <MaterialCommunityIcons name="gift-outline" size={26} color="#fff" />
                      </Pressable>
                      <Text style={styles.reelCount}>{reelGifts[item.id] ?? 0}</Text>
                    </View>
                  </View>
                  <View style={styles.reelBottom}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Avatar uri={reelAuthor.avatar} size={32} />
                      <Text style={styles.reelUser}>@{item.username}</Text>
                      {authorCircle ? <Text style={styles.reelCircle}>{authorCircle.name}</Text> : null}
                      {item.username !== ME && !myFollowing.includes(item.username) ? (
                        <Pressable
                          style={styles.reelFollow}
                          accessibilityLabel={`Follow ${item.username}`}
                          accessibilityRole="button"
                          onPress={() => toggleFollow(item.username)}>
                          <Text style={styles.reelFollowTxt}>Follow</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <Text style={styles.reelCap} numberOfLines={2}>
                      {item.caption}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <MaterialCommunityIcons name="music" size={13} color="#fff" />
                      <Text style={styles.reelAudio} numberOfLines={1}>
                        Original audio · {item.username}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <Pressable
                        style={styles.reelVote}
                        accessibilityLabel="Not interested"
                        accessibilityRole="button"
                        onPress={() => {
                          try {
                            reelsRef.current?.scrollToIndex({ index: Math.min(index + 1, reelsPosts.length - 1), animated: true });
                          } catch {
                            setReelIndex(index + 1);
                          }
                        }}>
                        <MaterialCommunityIcons name="close" size={16} color="#fff" />
                        <Text style={styles.reelVoteTxt}>Not interested</Text>
                      </Pressable>
                      <Pressable
                        style={styles.reelVote}
                        accessibilityLabel="Interested"
                        accessibilityRole="button"
                        onPress={() => {
                          if (!item.likes.includes(ME)) toggleLike(item.id);
                          try {
                            reelsRef.current?.scrollToIndex({ index: Math.min(index + 1, reelsPosts.length - 1), animated: true });
                          } catch {
                            setReelIndex(index + 1);
                          }
                        }}>
                        <MaterialCommunityIcons name="check" size={16} color="#fff" />
                        <Text style={styles.reelVoteTxt}>Interested</Text>
                      </Pressable>
                    </View>
                  </View>
                  <Pressable
                    style={styles.reelMore}
                    hitSlop={8}
                    accessibilityLabel="More options"
                    accessibilityRole="button"
                    onPress={() => setOptionsPostId(item.id)}>
                    <MaterialCommunityIcons name="dots-horizontal" size={22} color="#fff" />
                  </Pressable>
                </View>
              );
            }}
          />
        </View>
      ) : tab === 'search' && !createOpen && !activityOpen ? (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View style={[styles.searchField, { flex: 1 }]}>
              <MaterialCommunityIcons name="magnify" size={18} color={C.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search people, circles, #tags"
                placeholderTextColor={C.muted}
                style={styles.searchInput}
                autoCapitalize="none"
                returnKeyType="search"
                onSubmitEditing={() => rememberSearch(query)}
              />
              {query ? (
                <Pressable
                  hitSlop={8}
                  accessibilityLabel="Clear search"
                  accessibilityRole="button"
                  onPress={() => setQuery('')}>
                  <MaterialCommunityIcons name="close-circle" size={18} color={C.muted} />
                </Pressable>
              ) : null}
            </View>
            <IconBtn
              icon="bookmark-outline"
              label="Saved posts"
              size={26}
              onPress={() => {
                setTab('profile');
                setProfileMode('saved');
              }}
            />
            <IconBtn
              icon={exploreCols === 3 ? 'dots-grid' : 'grid-large'}
              label="Toggle grid density"
              size={26}
              onPress={() => {
                tap();
                setExploreCols((c) => (c === 3 ? 2 : 3));
              }}
            />
          </View>
          <View style={[styles.profileTabs, { paddingHorizontal: 16, marginTop: 0 }]}>
            <Pressable onPress={() => setExploreMode('posts')}>
              <Text style={[styles.profileTab, exploreMode === 'posts' && styles.profileTabOn]}>
                Posts
              </Text>
            </Pressable>
            <Pressable onPress={() => setExploreMode('reels')}>
              <Text style={[styles.profileTab, exploreMode === 'reels' && styles.profileTabOn]}>
                Reels
              </Text>
            </Pressable>
            <Pressable onPress={() => setExploreMode('people')}>
              <Text style={[styles.profileTab, exploreMode === 'people' && styles.profileTabOn]}>
                People
              </Text>
            </Pressable>
          </View>
          {query.trim() !== '' ? (
          <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>People</Text>
            </View>
            {filteredUsers.map((u) => (
              <View key={u.username} style={styles.thread}>
                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
                  onPress={() => openProfile(u.username, query.trim() || u.username)}>
                  <Avatar uri={u.avatar} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.postUser}>{u.username}</Text>
                    <Text style={styles.muted}>{u.name}</Text>
                  </View>
                </Pressable>
                {u.username !== ME ? (
                  <Pressable
                    style={styles.miniFollow}
                    onPress={() => toggleFollow(u.username)}>
                    <Text style={{ color: '#0095f6', fontWeight: '600' }}>
                      {myFollowing.includes(u.username) ? 'Following' : 'Follow'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Posts</Text>
            </View>
            <View style={styles.grid}>
              {filteredPosts.map((p) => (
                <Pressable key={p.id} style={[styles.cell, exploreCols === 2 && { width: '50%' }]} onPress={() => setCommentsPostId(p.id)}>
                  <Image source={{ uri: p.image }} style={styles.cellImg} contentFit="cover" />
                  {p.kind === 'video' ? (
                    <View style={styles.reelBadge}>
                      <MaterialCommunityIcons name="play" size={16} color="#fff" />
                    </View>
                  ) : null}
                  <View style={styles.viewBadge}>
                    <MaterialCommunityIcons name="eye-outline" size={14} color="#fff" />
                    <Text style={styles.viewTxt}>{viewsForPost(p.id)}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
            {filteredPosts.length === 0 && filteredUsers.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.muted}>Nothing matches “{query}”.</Text>
                <Pressable style={[styles.secondary, { marginTop: 8 }]} onPress={() => setQuery('')}>
                  <Text style={styles.secondaryTxt}>Clear search</Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
          ) : exploreMode === 'reels' ? (
            <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
            <View style={styles.grid}>
              {filteredPosts.map((p, i) => (
                <Pressable
                  key={p.id}
                  style={[styles.cell, exploreCols === 2 && { width: '50%' }]}
                  onPress={() => {
                    setReelIndex(i);
                    setTab('reels');
                  }}>
                  <Image source={{ uri: p.image }} style={styles.cellImg} contentFit="cover" />
                  <View style={styles.reelBadge}>
                    <MaterialCommunityIcons name="play" size={16} color="#fff" />
                  </View>
                  <View style={styles.viewBadge}>
                    <MaterialCommunityIcons name="eye-outline" size={14} color="#fff" />
                    <Text style={styles.viewTxt}>{viewsForPost(p.id)}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
            </ScrollView>
          ) : exploreMode === 'people' ? (
          <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
            <Pressable
              style={styles.thread}
              onPress={() => {
                setSettingsOpen(true);
                setSettingsPage('permissions');
              }}>
              <MaterialCommunityIcons name="account-plus-outline" size={22} color={C.text} />
              <Text style={[styles.postUser, { flex: 1 }]}>Find friends from phone contacts</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={C.muted} />
            </Pressable>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Discover people</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.discoverRow}>
              {users
                .filter((u) => u.username !== ME && !myFollowing.includes(u.username) && !settings.blocked.includes(u.username))
                .slice(0, 6)
                .map((u) => (
                  <View key={u.username} style={styles.discoverCard}>
                    <Pressable onPress={() => openProfile(u.username, u.username)}>
                      <Avatar uri={u.avatar} size={52} />
                    </Pressable>
                    <Text style={styles.discoverName} numberOfLines={1}>
                      {u.username}
                    </Text>
                    <Pressable
                      style={styles.followPill}
                      accessibilityLabel={`Follow ${u.username}`}
                      accessibilityRole="button"
                      onPress={() => toggleFollow(u.username)}>
                      <Text style={styles.followPillTxt}>Follow</Text>
                    </Pressable>
                  </View>
                ))}
            </ScrollView>
            {searchHistory.length > 0 ? (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Recent</Text>
                  <Pressable
                    accessibilityLabel="Clear search history"
                    accessibilityRole="button"
                    onPress={() => setSearchHistory([])}>
                    <Text style={styles.clearTxt}>Clear</Text>
                  </Pressable>
                </View>
                {searchHistory.map((h) => (
                  <Pressable key={h} style={styles.thread} onPress={() => setQuery(h)}>
                    <MaterialCommunityIcons name="history" size={20} color={C.muted} />
                    <Text style={[styles.postUser, { flex: 1 }]}>{h}</Text>
                  </Pressable>
                ))}
              </>
            ) : null}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>All people</Text>
            </View>
            {filteredUsers.map((u) => (
              <View key={u.username} style={styles.thread}>
                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
                  onPress={() => openProfile(u.username, u.username)}>
                  <Avatar uri={u.avatar} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.postUser}>{u.username}</Text>
                    <Text style={styles.muted}>{u.name}</Text>
                  </View>
                </Pressable>
                {u.username !== ME ? (
                  <Pressable
                    style={styles.miniFollow}
                    onPress={() => toggleFollow(u.username)}>
                    <Text style={{ color: '#0095f6', fontWeight: '600' }}>
                      {myFollowing.includes(u.username) ? 'Following' : 'Follow'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </ScrollView>
          ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
            <View style={styles.grid}>
              {filteredPosts.map((p) => (
                <Pressable key={p.id} style={[styles.cell, exploreCols === 2 && { width: '50%' }]} onPress={() => setCommentsPostId(p.id)}>
                  <Image source={{ uri: p.image }} style={styles.cellImg} contentFit="cover" />
                  {p.kind === 'video' ? (
                    <View style={styles.reelBadge}>
                      <MaterialCommunityIcons name="play" size={16} color="#fff" />
                    </View>
                  ) : null}
                  <View style={styles.viewBadge}>
                    <MaterialCommunityIcons name="eye-outline" size={14} color="#fff" />
                    <Text style={styles.viewTxt}>{viewsForPost(p.id)}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
            {filteredPosts.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.muted}>No posts yet.</Text>
              </View>
            ) : null}
          </ScrollView>
          )}
        </View>
      ) : createOpen ? (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Pressable
              style={styles.miniFollow}
              accessibilityLabel="Close create"
              accessibilityRole="button"
              onPress={() => setCreateOpen(false)}>
              <Text style={{ color: C.text, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <Text style={[styles.sectionTitle, { flex: 1, textAlign: 'center', marginBottom: 0 }]}>New moment</Text>
            <Pressable
              style={styles.miniFollow}
              accessibilityLabel="Share post"
              accessibilityRole="button"
              onPress={publishPost}>
              <Text style={{ color: '#0095f6', fontWeight: '700' }}>Share</Text>
            </Pressable>
          </View>
          <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
            <Text style={[styles.muted, { marginBottom: 4 }]}>Share to</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, paddingHorizontal: 16 }}>
              <Pressable
                style={[styles.chip, activeCircleId === null && { backgroundColor: '#0095F6', borderColor: '#0095F6' }]}
                accessibilityLabel="Share to all circles"
                accessibilityRole="button"
                onPress={() => setActiveCircleId(null)}>
                <Text style={[styles.chipTxt, activeCircleId === null && { color: '#fff', fontWeight: '700' }]}>
                  All circles
                </Text>
              </Pressable>
              {myCircles.map((c) => {
                const on = activeCircleId === c.id;
                return (
                  <Pressable
                    key={c.id}
                    style={[styles.chip, on && { backgroundColor: '#0095F6', borderColor: '#0095F6' }]}
                    accessibilityLabel={`Share to ${c.name}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setActiveCircleId(c.id)}>
                    <Text style={[styles.chipTxt, on && { color: '#fff', fontWeight: '700' }]}>
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          <View style={{ width: '100%', aspectRatio: 4 / 5, borderRadius: 16, overflow: 'hidden', backgroundColor: '#efefef' }}>
            {pickedUri && pickedKind === 'video' ? (
              <AutoVideo uri={pickedUri} style={{ width: '100%', height: '100%' }} />
            ) : (
              <Image
                source={{ uri: pickedUri ?? createPhoto(createSeed) }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            )}
            {createTone !== 'normal' ? (
              <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { backgroundColor: toneOverlay(createTone) }]}
              />
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, paddingHorizontal: 16, marginTop: 12 }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingRight: 8 }}>
              {Object.entries(POST_TONES).map(([key, t]) => {
                const on = createTone === key;
                return (
                  <Pressable
                    key={key}
                    style={{ alignItems: 'center', gap: 4 }}
                    accessibilityLabel={`${t.label} filter`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      tap();
                      setCreateTone(key);
                    }}>
                    <View
                      style={[
                        styles.toneSwatch,
                        { backgroundColor: t.overlay === 'transparent' ? C.fill : t.overlay },
                        on && { borderColor: '#0095F6', borderWidth: 2.5 },
                      ]}
                    />
                    <Text style={[styles.muted, { fontSize: 11 }, on && { color: C.text, fontWeight: '700' }]}>
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <Pressable
              style={styles.secondary}
              onPress={async () => {
                const photo = await takePhoto();
                if (photo) {
                  setPickedUri(photo.uri);
                  setPickedKind('image');
                  setPhotoMsg('');
                } else {
                  setPhotoMsg('Camera permission is needed. Allow it in Settings › Permissions.');
                }
              }}>
              <Text style={styles.secondaryTxt}>Take photo</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={async () => {
                const photo = await pickFromLibrary();
                if (photo) {
                  setPickedUri(photo.uri);
                  setPickedKind('image');
                  setPhotoMsg('');
                } else {
                  setPhotoMsg('Photo access is needed. Allow it in Settings › Permissions.');
                }
              }}>
              <Text style={styles.secondaryTxt}>Choose photo</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={async () => {
                const clip = await pickVideoFromLibrary();
                if (clip) {
                  setPickedUri(clip.uri);
                  setPickedKind('video');
                  setPhotoMsg('');
                } else {
                  setPhotoMsg('Photo access is needed. Allow it in Settings › Permissions.');
                }
              }}>
              <Text style={styles.secondaryTxt}>Choose video</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={() => setCameraOpen('create')}>
              <Text style={styles.secondaryTxt}>In-app camera</Text>
            </Pressable>
          </View>
          {pickedUri && pickedKind === 'image' && pickedUri.startsWith('file') ? (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <Text style={styles.muted}>Edit:</Text>
              <Pressable
                style={styles.secondary}
                accessibilityLabel="Rotate photo"
                accessibilityRole="button"
                disabled={editBusy}
                onPress={async () => {
                  setEditBusy(true);
                  try {
                    const out = await manipulateAsync(pickedUri, [{ rotate: 90 }], { compress: 0.85, format: SaveFormat.JPEG });
                    setPickedUri(out.uri);
                  } catch {
                    setPhotoMsg('Could not edit this photo.');
                  }
                  setEditBusy(false);
                }}>
                <Text style={styles.secondaryTxt}>{editBusy ? 'Working…' : 'Rotate'}</Text>
              </Pressable>
              <Pressable
                style={styles.secondary}
                accessibilityLabel="Flip photo"
                accessibilityRole="button"
                disabled={editBusy}
                onPress={async () => {
                  setEditBusy(true);
                  try {
                    const out = await manipulateAsync(pickedUri, [{ flip: FlipType.Horizontal }], { compress: 0.85, format: SaveFormat.JPEG });
                    setPickedUri(out.uri);
                  } catch {
                    setPhotoMsg('Could not edit this photo.');
                  }
                  setEditBusy(false);
                }}>
                <Text style={styles.secondaryTxt}>Flip</Text>
              </Pressable>
            </View>
          ) : null}
          {photoMsg ? (
            <View>
              <Text style={styles.muted}>{photoMsg}</Text>
              <Pressable style={styles.miniFollow} onPress={() => Linking.openSettings()}>
                <Text style={{ color: '#0095f6', fontWeight: '600' }}>Open system settings</Text>
              </Pressable>
            </View>
          ) : null}
          {pickedUri ? (
            <Pressable
              style={styles.miniFollow}
              onPress={() => {
                setPickedUri(null);
                setPickedKind('image');
                setCreateTone('normal');
              }}>
              <Text style={{ color: '#0095f6', fontWeight: '600' }}>Use a sample photo instead</Text>
            </Pressable>
          ) : null}
          <View style={styles.seedRow}>
            {CREATE_SEEDS.map((s) => (
              <Pressable
                key={s}
                onPress={() => {
                  setCreateSeed(s);
                  setPickedUri(null);
                }}>
                <Image
                  source={{ uri: createPhoto(s) }}
                  style={[
                    styles.seed,
                    createSeed === s && !pickedUri && { borderColor: '#0095f6', borderWidth: 3 },
                  ]}
                  contentFit="cover"
                />
              </Pressable>
            ))}
          </View>
          <TextInput
            value={createCaption}
            onChangeText={setCreateCaption}
            placeholder="Share a small moment... try #travel"
            style={[styles.input, { marginTop: 12 }]}
            multiline
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <Pressable style={styles.secondary} onPress={tagPlace}>
              <Text>{placeBusy ? 'Locating...' : placeTag ? `📍 ${placeTag}` : 'Add location'}</Text>
            </Pressable>
            {placeTag ? (
              <Pressable style={styles.miniFollow} onPress={() => setPlaceTag(null)}>
                <Text style={{ color: '#0095f6' }}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
          {pickedUri ? (
            <View style={{ marginTop: 4 }}>
              <Pressable
                style={styles.secondary}
                onPress={async () => {
                  const ok = await saveToLibrary(pickedUri);
                  setSaveMsg(ok ? 'Saved to photo library.' : 'Could not save — photo permission denied.');
                }}>
                <Text style={styles.secondaryTxt}>Save photo to library</Text>
              </Pressable>
              {saveMsg ? <Text style={styles.muted}>{saveMsg}</Text> : null}
            </View>
          ) : null}
        </ScrollView>
      ) : activityOpen ? (
        <View style={{ flex: 1 }}>
          <View style={{ height: 4 }} />
          <FlatList
          style={{ flex: 1 }}
          data={activity}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: 12 }}
          ListHeaderComponent={
            settings.followRequests.length > 0 ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.sectionTitle}>Follow requests</Text>
                {settings.followRequests.map((r) => (
                  <View key={r} style={styles.thread}>
                    <Avatar uri={userByName(users, r).avatar} size={40} />
                    <Text style={[styles.postUser, { flex: 1 }]}>{r}</Text>
                    <Pressable style={styles.reqBtn} onPress={() => acceptRequest(r)}>
                      <Text style={styles.publishTxt}>Accept</Text>
                    </Pressable>
                    <Pressable style={styles.secondary} onPress={() => declineRequest(r)}>
                      <Text style={styles.secondaryTxt}>Decline</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.thread}
              onPress={() => {
                if (item.postId) setCommentsPostId(item.postId);
                else openProfile(item.actor);
              }}>
              <Avatar uri={userByName(users, item.actor).avatar} size={40} />
              <Text style={{ flex: 1, color: C.text }}>
                <Text style={{ fontWeight: '700' }}>{item.actor} </Text>
                {item.text}
              </Text>
              {item.postId ? (
                <Image
                  source={{ uri: posts.find((p) => p.id === item.postId)?.image ?? '' }}
                  style={{ width: 44, height: 44, backgroundColor: '#efefef' }}
                  contentFit="cover"
                />
              ) : null}
              <Text style={styles.muted}>{timeAgo(item.createdAt)}</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            settings.followRequests.length > 0 ? null : (
              <View style={styles.center}>
                <Text style={styles.muted}>No activity yet — likes, comments and new followers show up here.</Text>
                <Pressable
                  style={[styles.publish, { marginTop: 8 }]}
                  accessibilityLabel="Find people to follow"
                  accessibilityRole="button"
                  onPress={() => setTab('search')}>
                  <Text style={styles.publishTxt}>Find people to follow</Text>
                </Pressable>
              </View>
            )
          }
          />
        </View>
      ) : (
        <ScrollView>
          <View style={styles.profileHead}>
            <Pressable
              onPress={changeAvatar}
              hitSlop={8}
              accessibilityLabel="Edit profile photo"
              accessibilityRole="button">
              <Avatar uri={me.avatar} size={80} />
            </Pressable>
            <View style={styles.stat}>
              <Text style={styles.statN}>{myPosts.length}</Text>
              <Text style={styles.muted}>Posts</Text>
            </View>
            <Pressable
              style={styles.stat}
              accessibilityLabel="Your followers"
              accessibilityRole="button"
              onPress={() => setFollowList({ title: 'Followers', users: myFollowers })}>
              <Text style={styles.statN}>{myFollowers.length}</Text>
              <Text style={styles.muted}>Followers</Text>
            </Pressable>
            <Pressable
              style={styles.stat}
              accessibilityLabel="Accounts you follow"
              accessibilityRole="button"
              onPress={() => setFollowList({ title: 'Following', users: myFollowing })}>
              <Text style={styles.statN}>{myFollowing.length}</Text>
              <Text style={styles.muted}>Following</Text>
            </Pressable>
          </View>
          <View style={{ paddingHorizontal: 12 }}>
            <Text style={styles.postUser}>{me.name}</Text>
            {editingBio ? (
              <View>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Name"
                  style={[styles.input, { marginBottom: 8 }]}
                />
                <TextInput
                  value={editUsername}
                  onChangeText={setEditUsername}
                  placeholder="Username"
                  autoCapitalize="none"
                  style={[styles.input, { marginBottom: 8 }]}
                />
                <TextInput
                  value={bioDraft}
                  onChangeText={setBioDraft}
                  placeholder="Write a bio"
                  style={styles.input}
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <Pressable
                    style={styles.publish}
                    onPress={() => {
                      const nm = editName.trim();
                      const un = editUsername.trim().toLowerCase().replace(/\s+/g, '');
                      setUsers((prev) =>
                        prev.map((u) =>
                          u.username === ME
                            ? {
                                ...u,
                                name: nm || u.name,
                                username: un || u.username,
                                bio: bioDraft.trim() || u.bio,
                              }
                            : u,
                        ),
                      );
                      setEditingBio(false);
                    }}>
                    <Text style={styles.publishTxt}>Save</Text>
                  </Pressable>
                  <Pressable style={styles.secondary} onPress={() => setEditingBio(false)}>
                    <Text style={styles.secondaryTxt}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  setEditName(me.name);
                  setEditUsername(me.username);
                  setBioDraft(me.bio);
                  setEditingBio(true);
                }}>
                <Text style={{ color: C.text }}>{me.bio}</Text>
              </Pressable>
            )}
            {!editingBio ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Pressable
                  style={[styles.profileBtn, { flex: 1 }]}
                  accessibilityLabel="Edit profile"
                  accessibilityRole="button"
                  onPress={() => {
                    setEditName(me.name);
                    setEditUsername(me.username);
                    setBioDraft(me.bio);
                    setEditingBio(true);
                  }}>
                  <Text style={styles.profileBtnTxt}>Edit profile</Text>
                </Pressable>
                <Pressable
                  style={[styles.profileBtn, { flex: 1 }]}
                  accessibilityLabel="Share profile"
                  accessibilityRole="button"
                  onPress={() => {
                    tap();
                    setMessages((prev) => [
                      ...prev,
                      { id: `m${Date.now()}`, from: ME, to: 'ana', text: `Check out @${me.username}`, createdAt: Date.now() },
                    ]);
                    setTab('direct');
                    setActiveChat('ana');
                  }}>
                  <Text style={styles.profileBtnTxt}>Share profile</Text>
                </Pressable>
                <Pressable
                  style={[styles.profileBtn, { width: 48 }]}
                  accessibilityLabel="Discover people"
                  accessibilityRole="button"
                  onPress={() => {
                    tap();
                    setTab('search');
                    setExploreMode('people');
                  }}>
                  <MaterialCommunityIcons name="account-plus-outline" size={20} color={C.text} />
                </Pressable>
              </View>
            ) : null}
            <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Highlights</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {settings.highlights.map((h) => (
                <Pressable
                  key={h.name}
                  style={styles.storyItem}
                  accessibilityLabel={`Open highlight ${h.name}`}
                  accessibilityRole="button"
                  onPress={() => {
                    setStoryPage(0);
                    setCustomStory({ username: ME, images: h.images.length > 0 ? h.images : [me.avatar] });
                  }}>
                  {h.images[0] ? (
                    <Avatar uri={h.images[0]} size={64} ring={false} />
                  ) : (
                    <View style={styles.hlEmpty}>
                      <MaterialCommunityIcons name="star-outline" size={24} color={C.muted} />
                    </View>
                  )}
                  <Text style={styles.storyName} numberOfLines={1}>
                    {h.name}
                  </Text>
                </Pressable>
              ))}
              <View style={styles.storyItem}>
                  <Pressable
                    style={styles.hlNew}
                    accessibilityLabel="Create new highlight"
                    accessibilityRole="button"
                    onPress={addHighlight}>
                    <MaterialCommunityIcons name="plus" size={28} color={C.text} />
                  </Pressable>
                <TextInput
                  value={highlightName}
                  onChangeText={setHighlightName}
                  placeholder="New"
                  placeholderTextColor="#8e8e93"
                  style={styles.hlInput}
                  onSubmitEditing={addHighlight}
                  returnKeyType="done"
                />
              </View>
            </ScrollView>
            <View style={styles.profileTabs}>
              {(
                [
                  { mode: 'posts', icon: 'grid', label: 'Posts grid' },
                  { mode: 'reels', icon: 'play-box-outline', label: 'Reels grid' },
                  { mode: 'saved', icon: 'bookmark-outline', label: 'Saved posts' },
                  { mode: 'tagged', icon: 'tag-outline', label: 'Tagged posts' },
                ] as const
              ).map((t) => {
                const count = t.mode === 'saved' ? `, ${savedPosts.length}` : '';
                const on = profileMode === t.mode;
                return (
                  <Pressable
                    key={t.mode}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: 8,
                      borderBottomWidth: on ? 1.5 : 0,
                      borderBottomColor: C.text,
                    }}
                    accessibilityLabel={t.label + count}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setProfileMode(t.mode)}>
                    <MaterialCommunityIcons
                      name={(on ? t.icon.replace('-outline', '') : t.icon) as never}
                      size={26}
                      color={on ? C.text : C.muted}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
          {profileMode === 'saved' && settings.collections.length > 0 ? (
            <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={styles.sectionTitle}>Collections</Text>
              {settings.collections.map((c) => (
                <Pressable
                  key={c.name}
                  style={styles.thread}
                  accessibilityLabel={`Show collection ${c.name}`}
                  accessibilityRole="button"
                  onPress={() => setActiveCollection((cur) => (cur === c.name ? null : c.name))}>
                  <MaterialCommunityIcons
                    name={activeCollection === c.name ? 'bookmark-multiple' : 'bookmark-multiple-outline'}
                    size={22}
                    color={C.text}
                  />
                  <Text style={[styles.postUser, { flex: 1 }]}>{c.name}</Text>
                  <Text style={styles.muted}>{c.ids.length} saved</Text>
                </Pressable>
              ))}
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput
                  value={newCollection}
                  onChangeText={setNewCollection}
                  placeholder="New collection name"
                  style={[styles.input, { flex: 1 }]}
                />
                <Pressable style={styles.publish} onPress={createCollection}>
                  <Text style={styles.publishTxt}>Add</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {profileMode === 'saved' && activeCollection ? (
            <View style={{ paddingHorizontal: 12, paddingBottom: 4 }}>
              <Pressable
                style={[styles.secondary, { alignSelf: 'flex-start' }]}
                accessibilityLabel="Clear collection filter"
                accessibilityRole="button"
                onPress={() => setActiveCollection(null)}>
                <Text style={styles.secondaryTxt}>{activeCollection} ✕</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.grid}>
            {(profileMode === 'posts'
              ? myPosts.filter((p) => !settings.archived.includes(p.id))
              : profileMode === 'reels'
                ? myPosts.filter((p) => !settings.archived.includes(p.id))
                : profileMode === 'saved'
                  ? activeCollection
                    ? savedPosts.filter(
                        (p) =>
                          settings.collections.find((c) => c.name === activeCollection)?.ids.includes(p.id) ?? false,
                      )
                    : savedPosts
                  : posts.filter((p) => p.comments.some((c) => c.username === ME)))
              .map((p) => (
                <Pressable
                  key={p.id}
                  style={styles.cell}
                  onPress={() => {
                    if (profileMode === 'reels') {
                      const i = filteredPosts.findIndex((f) => f.id === p.id);
                      setReelIndex(i >= 0 ? i : 0);
                      setTab('reels');
                    } else {
                      setCommentsPostId(p.id);
                    }
                  }}>
                  <Image source={{ uri: p.image }} style={styles.cellImg} contentFit="cover" />
                  {profileMode === 'reels' || p.kind === 'video' ? (
                    <View style={styles.reelBadge}>
                      <MaterialCommunityIcons name="play" size={16} color="#fff" />
                    </View>
                  ) : null}
                </Pressable>
              ))}
          </View>
          {profileMode === 'posts' && myPosts.filter((p) => !settings.archived.includes(p.id)).length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.muted}>Share your first photo with your followers.</Text>
              <Pressable
                style={[styles.publish, { marginTop: 8 }]}
                accessibilityLabel="Create your first post"
                accessibilityRole="button"
                onPress={() => setCreateOpen(true)}>
                <Text style={styles.publishTxt}>Create post</Text>
              </Pressable>
            </View>
          ) : null}
          {profileMode === 'saved' && savedPosts.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.muted}>Nothing saved yet. Tap the bookmark icon on any post to keep it here.</Text>
              <Pressable
                style={[styles.publish, { marginTop: 8 }]}
                accessibilityLabel="Explore posts to save"
                accessibilityRole="button"
                onPress={() => setTab('search')}>
                <Text style={styles.publishTxt}>Explore posts</Text>
              </Pressable>
            </View>
          ) : null}
          {profileMode === 'reels' && myPosts.filter((p) => !settings.archived.includes(p.id)).length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.muted}>No reels yet — your video moments will land here.</Text>
            </View>
          ) : null}
          {profileMode === 'tagged' && posts.filter((p) => p.comments.some((c) => c.username === ME)).length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.muted}>No tagged posts yet — photos people tag you in show up here.</Text>
            </View>
          ) : null}
        </ScrollView>
      )}

      {/* Bottom tabs */}
      {!activeChat && !profileUser && !createOpen && !activityOpen ? (
        <View style={styles.tabFloat}>
          <View style={styles.tabBar}>
            <BlurView
              intensity={70}
              tint={dark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.tabItem, tab === 'home' && styles.tabItemOn]}>
              <IconBtn
                icon={tab === 'home' ? 'home' : 'home-outline'}
                label="Home feed"
                size={28}
                selected={tab === 'home'}
                color={tab === 'home' ? C.text : C.muted}
                onPress={() => setTab('home')}
              />
            </View>
            <View style={[styles.tabItem, tab === 'reels' && styles.tabItemOn]}>
              <IconBtn
                icon="play-box-outline"
                label="Reels"
                size={28}
                selected={tab === 'reels'}
                color={tab === 'reels' ? C.text : C.muted}
                onPress={() => setTab('reels')}
              />
            </View>
            <View style={[styles.tabItem, tab === 'direct' && styles.tabItemOn]}>
              <Pressable
                onPress={() => setTab('direct')}
                hitSlop={8}
                accessibilityLabel={unreadCount > 0 ? `Direct messages, ${unreadCount} unread` : 'Direct messages'}
                accessibilityRole="button"
                accessibilityState={{ selected: tab === 'direct' }}
                style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}>
                <View>
                  <MaterialCommunityIcons
                    name={tab === 'direct' ? 'send' : 'send-outline'}
                    size={28}
                    color={C.text}
                  />
                  {unreadCount > 0 ? <View style={styles.badgeDot} /> : null}
                </View>
              </Pressable>
            </View>
            <View style={[styles.tabItem, tab === 'search' && styles.tabItemOn]}>
              <IconBtn
                icon="magnify"
                label="Search and explore"
                size={28}
                selected={tab === 'search'}
                color={tab === 'search' ? C.text : C.muted}
                onPress={() => setTab('search')}
              />
            </View>
            <View style={[styles.tabItem, tab === 'profile' && styles.tabItemOn]}>
              <Pressable
                onPress={() => setTab('profile')}
                hitSlop={8}
                accessibilityLabel="Your profile"
                accessibilityRole="button"
                accessibilityState={{ selected: tab === 'profile' }}
                style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}>
                <Avatar uri={me.avatar} size={24} ring={tab === 'profile'} />
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {/* Story viewer */}
      <Modal visible={viewer !== null} animationType="fade" transparent>
        <View style={styles.storyFull}>
          {viewer ? (
            <>
              <Pressable
                accessibilityLabel="Next story image"
                accessibilityRole="button"
                onPress={() => {
                  if (storyPage + 1 < viewerImages.length) setStoryPage(storyPage + 1);
                  else closeStory();
                }}>
                {viewerItem?.kind === 'video' ? (
                  <AutoVideo
                    key={`${viewerName}-${storyPage}`}
                    uri={viewerItem.uri}
                    style={{ width: '100%', height: '100%' }}
                  />
                ) : (
                  <Image
                    source={{ uri: viewerImages[storyPage % viewerImages.length] }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                )}
                {viewerItem?.tone ? (
                  <View
                    pointerEvents="none"
                    style={[StyleSheet.absoluteFill, { backgroundColor: toneOverlay(viewerItem.tone) }]}
                  />
                ) : null}
              </Pressable>
              <View style={styles.storyHeader}>
                <View style={{ flexDirection: 'row', gap: 4, width: '100%' }}>
                  {viewerImages.map((img, i) => (
                    <View
                      key={`${viewerName}-${i}`}
                      style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' }}>
                      {i < storyPage ? (
                        <View style={{ flex: 1, backgroundColor: '#fff' }} />
                      ) : i === storyPage ? (
                        <Animated.View
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            backgroundColor: '#fff',
                            width: storyProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                          }}
                        />
                      ) : null}
                    </View>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
                  <Avatar uri={userByName(users, viewerName).avatar} size={32} />
                  <Text style={styles.storyUser}>{viewerName}</Text>
                  <View style={{ flex: 1 }} />
                  <Pressable
                    hitSlop={8}
                    accessibilityLabel="Close story"
                    accessibilityRole="button"
                    onPress={closeStory}>
                    <MaterialCommunityIcons name="close" size={26} color="#fff" />
                  </Pressable>
                </View>
              </View>
              <View style={styles.storyFooter}>
                <Pressable
                  hitSlop={8}
                  accessibilityLabel="Like story"
                  accessibilityRole="button"
                  onPress={() => {
                    const key = `${viewerName}:${storyPage}`;
                    tap();
                    setStoryLiked((prev) => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    });
                  }}>
                  <MaterialCommunityIcons
                    name={storyLiked.has(`${viewerName}:${storyPage}`) ? 'heart' : 'heart-outline'}
                    size={28}
                    color={storyLiked.has(`${viewerName}:${storyPage}`) ? '#FF3040' : '#fff'}
                  />
                </Pressable>
                <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                  <Pressable
                    onPress={() => setStoryPage((p) => (p > 0 ? p - 1 : viewerImages.length - 1))}
                    accessibilityLabel="Previous story image"
                    accessibilityRole="button">
                    <MaterialCommunityIcons name="chevron-left" size={28} color="#fff" />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (storyPage + 1 < viewerImages.length) setStoryPage(storyPage + 1);
                      else closeStory();
                    }}
                    accessibilityLabel="Next story image"
                    accessibilityRole="button">
                    <MaterialCommunityIcons name="chevron-right" size={28} color="#fff" />
                  </Pressable>
                </View>
              </View>
              {viewerName !== ME ? (
                <View style={[styles.composer, { position: 'absolute', bottom: 70, left: 16, right: 16 }]}>
                  <TextInput
                    value={storyReply}
                    onChangeText={setStoryReply}
                    placeholder="Send a message"
                    placeholderTextColor="#999"
                    style={[styles.input, { backgroundColor: 'rgba(0,0,0,0.45)', borderColor: '#666', color: '#fff', borderRadius: 24 }]}
                    onSubmitEditing={sendStoryReply}
                    returnKeyType="send"
                  />
                  <Pressable
                    style={styles.sendBtn}
                    accessibilityLabel="Send story reply"
                    accessibilityRole="button"
                    onPress={sendStoryReply}>
                    <MaterialCommunityIcons name="send" size={20} color="#fff" />
                  </Pressable>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </Modal>

      {/* Comments */}
      <Modal visible={commentsPost !== null} animationType="slide" transparent>
        <View style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sectionTitle}>Comments</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {commentsPost?.comments
                .filter((c) => showHidden || !settings.restricted.includes(c.username))
                .map((c) => (
                <View key={c.id} style={styles.thread}>
                  <Avatar uri={userByName(users, c.username).avatar} size={32} />
                  <Text style={{ flex: 1, color: C.text }}>
                    <Text style={{ fontWeight: '700' }}>{c.username} </Text>
                    {c.text}
                  </Text>
                  <IconBtn
                    icon={commentLikes.has(c.id) ? 'heart' : 'heart-outline'}
                    label={commentLikes.has(c.id) ? 'Unlike comment' : 'Like comment'}
                    size={18}
                    selected={commentLikes.has(c.id)}
                      color={commentLikes.has(c.id) ? C.like : C.muted}
                    onPress={() => {
                      tap();
                      setCommentLikes((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.id)) next.delete(c.id);
                        else next.add(c.id);
                        return next;
                      });
                    }}
                  />
                  <Text style={styles.muted}>{timeAgo(c.createdAt)}</Text>
                </View>
              ))}
              {commentsPost && commentsPost.comments.length === 0 ? (
                <Text style={styles.muted}>Be the first to comment.</Text>
              ) : null}
              {commentsPost &&
              commentsPost.comments.some((c) => settings.restricted.includes(c.username)) ? (
                <Pressable
                  style={styles.miniFollow}
                  accessibilityLabel={showHidden ? 'Hide restricted comments' : 'Show hidden comments'}
                  accessibilityRole="button"
                  onPress={() => setShowHidden((v) => !v)}>
                  <Text style={{ color: '#0095f6', fontWeight: '600' }}>
                    {showHidden ? 'Hide restricted comments' : 'Show hidden comments'}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
            <View style={styles.composer}>
              <TextInput
                value={draftComment}
                onChangeText={setDraftComment}
                placeholder="Add a comment..."
                style={styles.input}
                onSubmitEditing={addComment}
                returnKeyType="send"
              />
              <Pressable
                style={styles.sendBtn}
                onPress={addComment}
                accessibilityLabel="Post comment"
                accessibilityRole="button">
                <MaterialCommunityIcons name="send" size={20} color="#fff" />
              </Pressable>
            </View>
            <Pressable style={styles.secondary} onPress={() => setCommentsPostId(null)}>
              <Text style={styles.secondaryTxt}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Post options */}
      <Modal visible={optionsPostId !== null} animationType="slide" transparent>
        <View style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            {(() => {
              const p = posts.find((x) => x.id === optionsPostId);
              if (!p) return null;
              const mine = p.username === ME;
              const saved = bookmarks.has(p.id);
              return (
                <>
                  <Text style={styles.sectionTitle}>Post by {p.username}</Text>
                  <MenuRow
                    icon={saved ? 'bookmark-off-outline' : 'bookmark-outline'}
                    title={saved ? 'Unsave' : 'Save'}
                    onPress={() => {
                      toggleBookmark(p.id);
                      setOptionsPostId(null);
                    }}
                  />
                  <MenuRow
                    icon="bookmark-multiple-outline"
                    title="Add to collection"
                    onPress={() => {
                      setCollectPostId(p.id);
                      setOptionsPostId(null);
                    }}
                  />
                  <MenuRow
                    icon="send-outline"
                    title="Share to Direct"
                    onPress={() => {
                      setTab('direct');
                      setActiveChat(p.username === ME ? 'ana' : p.username);
                      setOptionsPostId(null);
                    }}
                  />
                  {mine ? (
                    <>
                      <MenuRow
                        icon="archive-outline"
                        title={settings.archived.includes(p.id) ? 'Unarchive' : 'Archive'}
                        onPress={() => {
                          if (settings.archived.includes(p.id)) unarchivePost(p.id);
                          else archivePost(p.id);
                        }}
                      />
                      <MenuRow icon="delete-outline" title="Delete" onPress={() => deletePost(p.id)} />
                    </>
                  ) : (
                    <MenuRow
                      icon="eye-off-outline"
                      title={settings.muted.includes(p.username) ? `Unmute @${p.username}` : `Mute @${p.username}`}
                      onPress={() => {
                        toggleSettingList('muted', p.username);
                        setOptionsPostId(null);
                      }}
                    />
                  )}
                  <Pressable style={styles.secondary} onPress={() => setOptionsPostId(null)}>
                    <Text style={styles.secondaryTxt}>Close</Text>
                  </Pressable>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Add to collection */}
      <Modal visible={collectPostId !== null} animationType="slide" transparent>
        <View style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sectionTitle}>Save to collection</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {settings.collections.map((c) => (
                <Pressable key={c.name} style={styles.thread} onPress={() => addToCollection(c.name)}>
                  <MaterialCommunityIcons name="bookmark-multiple-outline" size={22} color={C.text} />
                  <Text style={[styles.postUser, { flex: 1 }]}>{c.name}</Text>
                  <Text style={styles.muted}>{c.ids.length}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <TextInput
                value={newCollection}
                onChangeText={setNewCollection}
                placeholder="New collection"
                style={[styles.input, { flex: 1 }]}
              />
              <Pressable style={styles.publish} onPress={createCollection}>
                <Text style={styles.publishTxt}>Add</Text>
              </Pressable>
            </View>
            <Pressable style={styles.secondary} onPress={() => setCollectPostId(null)}>
              <Text style={styles.secondaryTxt}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Hashtag feed */}
      <Modal visible={tagView !== null} animationType="slide">
        <SafeAreaView style={[styles.safe, { padding: 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Pressable
              hitSlop={8}
              accessibilityLabel="Back to Explore"
              accessibilityRole="button"
              onPress={() => setTagView(null)}>
              <MaterialCommunityIcons name="chevron-left" size={28} color={C.text} />
            </Pressable>
            <Text style={styles.sectionTitle}>{tagView}</Text>
          </View>
          <View style={styles.grid}>
            {(tagView
              ? visiblePosts.filter((p) => p.caption.toLowerCase().includes(tagView))
              : []
            ).map((p) => (
              <Pressable
                key={p.id}
                style={styles.cell}
                onPress={() => {
                  setTagView(null);
                  setCommentsPostId(p.id);
                }}>
                <Image source={{ uri: p.image }} style={styles.cellImg} contentFit="cover" />
              </Pressable>
            ))}
          </View>
          {tagView && visiblePosts.filter((p) => p.caption.toLowerCase().includes(tagView)).length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.muted}>No posts for {tagView} yet.</Text>
              <Pressable
                style={[styles.secondary, { marginTop: 8 }]}
                onPress={() => {
                  setTagView(null);
                  setTab('search');
                }}>
                <Text style={styles.secondaryTxt}>Back to Explore</Text>
              </Pressable>
            </View>
          ) : null}
        </SafeAreaView>
      </Modal>

      {/* Story composer */}
      <Modal visible={composerOpen} animationType="slide">
        <SafeAreaView style={[styles.safe, { padding: 16 }]}>
          <Text style={styles.sectionTitle}>New story</Text>
          <View style={{ width: '100%', height: 320, borderRadius: 12, overflow: 'hidden', backgroundColor: '#111' }}>
            {storyUri && storyKind === 'video' ? (
              <AutoVideo uri={storyUri} style={{ width: '100%', height: '100%' }} />
            ) : (
              <Image
                source={{ uri: storyUri ?? `https://picsum.photos/seed/${storySeed}/540/960` }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            )}
            {storyTone !== 'normal' ? (
              <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { backgroundColor: toneOverlay(storyTone) }]}
              />
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, paddingHorizontal: 16, marginTop: 12 }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingRight: 8 }}>
              {Object.entries(POST_TONES).map(([key, t]) => {
                const on = storyTone === key;
                return (
                  <Pressable
                    key={key}
                    style={{ alignItems: 'center', gap: 4 }}
                    accessibilityLabel={`${t.label} filter`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      tap();
                      setStoryTone(key);
                    }}>
                    <View
                      style={[
                        styles.toneSwatch,
                        { backgroundColor: t.overlay === 'transparent' ? C.fill : t.overlay },
                        on && { borderColor: '#0095F6', borderWidth: 2.5 },
                      ]}
                    />
                    <Text style={[styles.muted, { fontSize: 11 }, on && { color: C.text, fontWeight: '700' }]}>
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <Pressable
              style={styles.secondary}
              onPress={async () => {
                const photo = await takePhoto();
                if (photo) {
                  setStoryUri(photo.uri);
                  setStoryKind('image');
                  setPhotoMsg('');
                } else {
                  setPhotoMsg('Camera permission is needed. Allow it in Settings › Permissions.');
                }
              }}>
              <Text style={styles.secondaryTxt}>Take photo</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={async () => {
                const photo = await pickFromLibrary();
                if (photo) {
                  setStoryUri(photo.uri);
                  setStoryKind('image');
                  setPhotoMsg('');
                } else {
                  setPhotoMsg('Photo access is needed. Allow it in Settings › Permissions.');
                }
              }}>
              <Text style={styles.secondaryTxt}>Choose photo</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={async () => {
                const clip = await pickVideoFromLibrary();
                if (clip) {
                  setStoryUri(clip.uri);
                  setStoryKind('video');
                  setPhotoMsg('');
                } else {
                  setPhotoMsg('Photo access is needed. Allow it in Settings › Permissions.');
                }
              }}>
              <Text style={styles.secondaryTxt}>Choose video</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={async () => {
                const uris = await pickManyFromLibrary();
                if (uris.length > 0) {
                  pushStoryMedia(uris.map((uri) => ({ uri, kind: 'image' as const, tone: storyTone === 'normal' ? undefined : storyTone })));
                  setComposerOpen(false);
                  setPhotoMsg('');
                } else {
                  setPhotoMsg('Photo access is needed. Allow it in Settings › Permissions.');
                }
              }}>
              <Text style={styles.secondaryTxt}>Gallery (multi)</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={() => setCameraOpen('story')}>
              <Text style={styles.secondaryTxt}>In-app camera</Text>
            </Pressable>
          </View>
          {photoMsg ? (
            <View>
              <Text style={styles.muted}>{photoMsg}</Text>
              <Pressable style={styles.miniFollow} onPress={() => Linking.openSettings()}>
                <Text style={{ color: '#0095f6', fontWeight: '600' }}>Open system settings</Text>
              </Pressable>
            </View>
          ) : null}
          {storyUri ? (
            <Pressable
              style={styles.miniFollow}
              onPress={() => {
                setStoryUri(null);
                setStoryKind('image');
                setStoryTone('normal');
              }}>
              <Text style={{ color: '#0095f6', fontWeight: '600' }}>Use a sample photo instead</Text>
            </Pressable>
          ) : null}
          {!storyUri ? (
          <View style={styles.seedRow}>
            {['mystory1', 'mystory2', 'mystory3', 'mystory4'].map((s) => (
              <Pressable key={s} onPress={() => setStorySeed(s)}>
                <Image
                  source={{ uri: `https://picsum.photos/seed/${s}/200/356` }}
                  style={[styles.seed, storySeed === s && { borderColor: '#0095f6', borderWidth: 3 }]}
                  contentFit="cover"
                />
              </Pressable>
            ))}
          </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Pressable style={styles.publish} onPress={addStory}>
              <Text style={styles.publishTxt}>Share story</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={() => setComposerOpen(false)}>
              <Text style={styles.secondaryTxt}>Cancel</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Profile options (other users) */}
      <Modal visible={profileOptions} animationType="slide" transparent>
        <View style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sectionTitle}>@{profileName}</Text>
            {profileName ? (
              <>
                <MenuRow
                  icon="send-outline"
                  title="Share this profile"
                  onPress={() => {
                    setMessages((prev) => [
                      ...prev,
                      { id: `m${Date.now()}`, from: ME, to: 'ana', text: `Check out @${profileName}`, createdAt: Date.now() },
                    ]);
                    setProfileOptions(false);
                    setTab('direct');
                    setActiveChat('ana');
                  }}
                />
                {profileName !== ME ? (
                  <>
                    <MenuRow
                      icon={settings.blocked.includes(profileName) ? 'check' : 'block-helper'}
                      title={settings.blocked.includes(profileName) ? `Unblock @${profileName}` : `Block @${profileName}`}
                      onPress={() => {
                        toggleSettingList('blocked', profileName);
                        setProfileOptions(false);
                      }}
                    />
                    <MenuRow
                      icon="eye-off-outline"
                      title={settings.muted.includes(profileName) ? `Unmute @${profileName}` : `Mute @${profileName}`}
                      onPress={() => {
                        toggleSettingList('muted', profileName);
                        setProfileOptions(false);
                      }}
                    />
                    <MenuRow
                      icon="shield-outline"
                      title={settings.restricted.includes(profileName) ? `Unrestrict @${profileName}` : `Restrict @${profileName}`}
                      onPress={() => {
                        toggleSettingList('restricted', profileName);
                        setProfileOptions(false);
                      }}
                    />
                  </>
                ) : null}
              </>
            ) : null}
            <Pressable style={styles.secondary} onPress={() => setProfileOptions(false)}>
              <Text style={styles.secondaryTxt}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Call simulation */}
      <Modal visible={callState !== null} animationType="fade" transparent>
        <View style={styles.storyFull}>
          <Avatar uri={activeChat ? userByName(users, activeChat).avatar : me.avatar} size={72} />
          <Text style={styles.storyUser}>
            {callState?.video ? 'Video' : 'Voice'} call with {callState?.with}
          </Text>
          <Text style={{ color: '#8e8e93', marginTop: 4 }}>
            {callState?.muted ? 'Muted' : 'Connected'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            <Pressable
              style={styles.secondary}
              onPress={() =>
                setCallState((prev) => (prev ? { ...prev, muted: !prev.muted } : prev))
              }>
              <Text>{callState?.muted ? 'Unmute' : 'Mute'}</Text>
            </Pressable>
            <Pressable style={[styles.publish, { backgroundColor: C.like }]} onPress={() => setCallState(null)}>
              <Text style={styles.publishTxt}>End</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Conversation options */}
      <Modal visible={convOptions} animationType="slide" transparent>
        <View style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sectionTitle}>Conversation with {activeChat}</Text>
            {activeChat ? (
              <>
                <ToggleRow
                  label="Mute messages"
                  value={settings.muted.includes(activeChat)}
                  onToggle={() => toggleSettingList('muted', activeChat)}
                />
                <MenuRow
                  icon="delete-outline"
                  title="Delete conversation"
                  onPress={() => {
                    const other = activeChat;
                    setMessages((prev) =>
                      prev.filter(
                        (m) => !((m.from === ME && m.to === other) || (m.from === other && m.to === ME)),
                      ),
                    );
                    setConvOptions(false);
                    setActiveChat(null);
                  }}
                />
                <MenuRow
                  icon="block-helper"
                  title={settings.blocked.includes(activeChat) ? `Unblock @${activeChat}` : `Block @${activeChat}`}
                  onPress={() => {
                    toggleSettingList('blocked', activeChat);
                    setConvOptions(false);
                  }}
                />
              </>
            ) : null}
            <Pressable style={styles.secondary} onPress={() => setConvOptions(false)}>
              <Text style={styles.secondaryTxt}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* In-app camera */}
      <Modal visible={cameraOpen !== null} animationType="slide">
        <SafeAreaView style={[styles.safe, { backgroundColor: '#000' }]}>
          {!camPerm?.granted ? (
            <View style={styles.center}>
              <Text style={{ color: '#fff', marginBottom: 12 }}>Camera access is needed to take photos.</Text>
              <Pressable style={styles.publish} onPress={() => requestCamPerm()}>
                <Text style={styles.publishTxt}>Allow camera</Text>
              </Pressable>
              <Pressable style={styles.secondary} onPress={() => setCameraOpen(null)}>
                <Text style={styles.secondaryTxt}>Close</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <CameraView
                ref={cameraRef}
                style={{ flex: 1 }}
                facing={facing}
                onCameraReady={() => setCameraReady(true)}
              />
              {cameraErr ? <Text style={{ color: '#ff9f0a', paddingHorizontal: 16 }}>{cameraErr}</Text> : null}
              <View style={{ flexDirection: 'row', gap: 8, padding: 16, alignItems: 'center' }}>
                <Pressable
                  style={styles.secondary}
                  onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}>
                  <Text style={styles.secondaryTxt}>Flip camera</Text>
                </Pressable>
                <Pressable
                  style={[styles.publish, !cameraReady && { opacity: 0.5 }]}
                  onPress={capture}
                  disabled={!cameraReady}>
                  <Text style={styles.publishTxt}>{cameraReady ? 'Capture' : 'Starting camera…'}</Text>
                </Pressable>
                <Pressable style={styles.secondary} onPress={() => setCameraOpen(null)}>
                  <Text style={styles.secondaryTxt}>Close</Text>
                </Pressable>
              </View>
            </>
          )}
        </SafeAreaView>
      </Modal>

      {/* Followers / following */}
      <Modal visible={followList !== null} animationType="slide">
        <SafeAreaView style={[styles.safe, { paddingBottom: 16 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
            <Pressable
              hitSlop={8}
              accessibilityLabel="Close list"
              accessibilityRole="button"
              onPress={() => setFollowList(null)}>
              <MaterialCommunityIcons name="chevron-left" size={28} color={C.text} />
            </Pressable>
            <Text style={[styles.sectionTitle, { marginLeft: 8 }]}>{followList?.title}</Text>
          </View>
          <FlatList
            data={followList?.users ?? []}
            keyExtractor={(u) => u}
            renderItem={({ item: u }) => (
              <View style={styles.thread}>
                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
                  onPress={() => {
                    if (followList?.title === 'New message') {
                      setFollowList(null);
                      setActiveChat(u);
                    } else {
                      setFollowList(null);
                      openProfile(u);
                    }
                  }}>
                  <Avatar uri={userByName(users, u).avatar} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.postUser}>{u}</Text>
                    <Text style={styles.muted}>{userByName(users, u).name}</Text>
                  </View>
                </Pressable>
                {followList?.title === 'New message' ? (
                  <MaterialCommunityIcons name="chevron-right" size={20} color={C.muted} />
                ) : u === ME ? (
                  <Text style={styles.muted}>You</Text>
                ) : (
                  <Pressable style={styles.miniFollow} onPress={() => toggleFollow(u)}>
                    <Text style={{ color: '#0095f6', fontWeight: '600' }}>
                      {myFollowing.includes(u) ? 'Following' : 'Follow'}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.muted}>Nobody here yet.</Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>

      {/* Note viewer */}
      <Modal visible={noteModal !== null} animationType="fade" transparent>
        <View style={noteModal === ME ? styles.noteFullWrap : styles.noteBackdrop}>
          {noteModal !== ME ? (
            <Pressable style={StyleSheet.absoluteFill} onPress={closeNote} accessibilityLabel="Close note" />
          ) : null}
          {noteModal ? (
            noteModal === ME ? (
              <Animated.View style={[styles.noteFull, { opacity: noteModalAnim }]}>
                <Pressable
                  hitSlop={8}
                  accessibilityLabel="Close note composer"
                  accessibilityRole="button"
                  onPress={closeNote}
                  style={{ alignSelf: 'flex-start' }}>
                  <MaterialCommunityIcons name="close" size={30} color={C.text} />
                </Pressable>
                <View style={styles.notePill}>
                  <TextInput
                    value={noteDraft}
                    onChangeText={setNoteDraft}
                    placeholder="Note..."
                    placeholderTextColor={C.muted}
                    maxLength={60}
                    autoFocus
                    style={styles.notePillInput}
                    returnKeyType="done"
                    onSubmitEditing={saveNote}
                  />
                </View>
                <View style={{ alignItems: 'center', marginTop: 28 }}>
                  <View>
                    <Avatar uri={me.avatar} size={110} ring={false} />
                    {noteSongs[ME] ? (
                      <View style={styles.noteMusicBadge}>
                        <MaterialCommunityIcons name="music" size={15} color="#fff" />
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={styles.noteMediaRow}>
                  <Pressable
                    style={styles.noteMediaBtn}
                    accessibilityLabel="Attach a song"
                    accessibilityRole="button"
                    onPress={() => {
                      tap();
                      setAudioOpen(true);
                    }}>
                    <MaterialCommunityIcons name="music" size={22} color="#E1306C" />
                  </Pressable>
                  <Pressable
                    style={styles.noteMediaBtn}
                    accessibilityLabel="Add location"
                    accessibilityRole="button"
                    onPress={() => {
                      tap();
                      flashNoteHint('Locations live on posts — notes stay text + song.');
                    }}>
                    <MaterialCommunityIcons name="map-marker-outline" size={22} color="#962FBF" />
                  </Pressable>
                  <Pressable
                    style={styles.noteMediaBtn}
                    accessibilityLabel="Add GIF"
                    accessibilityRole="button"
                    onPress={() => {
                      tap();
                      flashNoteHint('GIFs are not here yet — pick a song instead.');
                    }}>
                    <MaterialCommunityIcons name="sticker-emoji" size={22} color="#34C759" />
                  </Pressable>
                </View>
                {noteSongs[ME] ? (
                  <Text style={styles.noteSongBig} numberOfLines={1}>
                    🎵 {noteSongs[ME]}
                  </Text>
                ) : null}
                {noteHint ? <Text style={styles.noteHint}>{noteHint}</Text> : null}
                <View style={{ flex: 1 }} />
                <View style={styles.noteBottom}>
                  <Pressable
                    accessibilityLabel="Choose audience"
                    accessibilityRole="button"
                    onPress={() => {
                      tap();
                      flashNoteHint('Notes go to all your circles for now.');
                    }}>
                    <Text style={styles.noteAudience}>👥 Share with friends {'>'}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.noteShareBtn}
                    accessibilityLabel="Share note"
                    accessibilityRole="button"
                    onPress={saveNote}>
                    <Text style={styles.noteShareTxt}>Share</Text>
                  </Pressable>
                </View>
              </Animated.View>
            ) : (
              <Animated.View
                style={[
                  styles.noteCard,
                  {
                    opacity: noteModalAnim,
                    transform: [
                      {
                        scale: noteModalAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }),
                      },
                      {
                        translateY: noteModalAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
                      },
                    ],
                  },
                ]}>
                <Avatar uri={userByName(users, noteModal).avatar} size={64} />
                <Text style={styles.noteCardName}>{noteModal}</Text>
                <Text style={styles.noteBig}>
                  {notes[noteModal] ?? 'No note right now.'}
                </Text>
                {noteSongs[noteModal] ? (
                  <View style={styles.noteSongRow}>
                    <MaterialCommunityIcons name="music" size={18} color={C.text} />
                    <Text style={{ color: C.text, fontWeight: '600' }}>{noteSongs[noteModal]}</Text>
                  </View>
                ) : null}
                <Pressable
                  style={[styles.publish, { alignSelf: 'stretch' }]}
                  onPress={() => {
                    const u = noteModal;
                    closeNote();
                    setActiveChat(u);
                  }}>
                  <Text style={styles.publishTxt}>Reply in chat</Text>
                </Pressable>
              </Animated.View>
            )
          ) : null}
        </View>
      </Modal>

      {/* Audio browser */}
      <Modal visible={audioOpen} animationType="slide" transparent>
        <View style={styles.sheetWrap}>
          <View style={[styles.sheet, { maxHeight: '82%' }]}>
            <View style={styles.sheetHandle} />
            <View style={[styles.searchField, { marginHorizontal: 16, marginBottom: 10 }]}>
              <MaterialCommunityIcons name="magnify" size={18} color={C.muted} />
              <TextInput
                value={audioQuery}
                onChangeText={setAudioQuery}
                placeholder="Search..."
                placeholderTextColor={C.muted}
                style={styles.searchInput}
                autoCapitalize="none"
              />
              {audioQuery ? (
                <Pressable
                  hitSlop={8}
                  accessibilityLabel="Clear audio search"
                  accessibilityRole="button"
                  onPress={() => setAudioQuery('')}>
                  <MaterialCommunityIcons name="close-circle" size={18} color={C.muted} />
                </Pressable>
              ) : null}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8 }}>
              {(
                [
                  { id: 'foryou', label: 'For you' },
                  { id: 'trending', label: 'Trending' },
                  { id: 'saved', label: 'Saved' },
                ] as const
              ).map((t) => {
                const on = audioTab === t.id;
                return (
                  <Pressable
                    key={t.id}
                    style={[styles.audioChip, on && styles.audioChipOn]}
                    accessibilityLabel={`${t.label} songs`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setAudioTab(t.id)}>
                    <Text style={[styles.audioChipTxt, on && styles.audioChipTxtOn]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <FlatList
              data={(() => {
                const q = audioQuery.trim().toLowerCase();
                let list = SONGS.map((s, i) => ({ ...s, hue: SONG_HUES[i % SONG_HUES.length] }));
                if (audioTab === 'trending') list = [list[2], list[0], list[4], list[1], list[3], list[5], ...list.slice(6)];
                if (audioTab === 'saved') {
                  list = list.filter((s) => savedSongs.has(`${s.title} · ${s.artist}`));
                }
                if (q) list = list.filter((s) => `${s.title} ${s.artist}`.toLowerCase().includes(q));
                return list;
              })()}
              keyExtractor={(s) => `${s.title}-${s.artist}`}
              renderItem={({ item: s }) => {
                const label = `${s.title} · ${s.artist}`;
                const saved = savedSongs.has(label);
                const attached = noteSongs[ME] === label;
                return (
                  <Pressable
                    style={styles.songRow}
                    accessibilityLabel={`Use ${label} in your note`}
                    accessibilityRole="button"
                    onPress={() => {
                      tap();
                      setNoteSongs((prev) => ({ ...prev, [ME]: label }));
                      setAudioOpen(false);
                    }}>
                    <View style={[styles.songArt, { backgroundColor: `hsl(${s.hue}, 55%, 42%)` }]}>
                      <MaterialCommunityIcons name="music" size={24} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.songTitle} numberOfLines={1}>
                        {s.title}
                        {attached ? ' ✓' : ''}
                      </Text>
                      <Text style={styles.muted} numberOfLines={1}>
                        {s.artist} • {s.dur}
                      </Text>
                    </View>
                    <Pressable
                      hitSlop={8}
                      accessibilityLabel={saved ? `Unsave ${s.title}` : `Save ${s.title}`}
                      accessibilityRole="button"
                      onPress={() => {
                        tap();
                        setSavedSongs((prev) => {
                          const next = new Set(prev);
                          if (next.has(label)) next.delete(label);
                          else next.add(label);
                          return next;
                        });
                      }}>
                      <MaterialCommunityIcons
                        name={saved ? 'bookmark' : 'bookmark-outline'}
                        size={26}
                        color={saved ? C.text : C.muted}
                      />
                    </Pressable>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={styles.muted}>
                    {audioTab === 'saved' ? 'No saved songs yet — tap bookmark on any track.' : 'No songs match.'}
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Settings hub */}
      <Modal visible={settingsOpen} animationType="slide">
        <SafeAreaView style={[styles.safe, { paddingBottom: 16 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
              <Pressable
                hitSlop={8}
                accessibilityLabel={settingsPage ? 'Back to settings' : 'Close settings'}
                accessibilityRole="button"
                onPress={() => {
                  if (settingsPage) setSettingsPage(null);
                  else setSettingsOpen(false);
                }}>
              <MaterialCommunityIcons
                name={settingsPage ? 'arrow-left' : 'close'}
                size={26}
                color={C.text}
              />
            </Pressable>
            <Text style={[styles.sectionTitle, { marginLeft: 8, fontSize: 34, fontWeight: '800' }]}>
              {settingsPage === null
                ? 'Settings'
                : settingsPage === 'notifications'
                  ? 'Notifications'
                  : settingsPage === 'privacy'
                    ? 'Privacy'
                    : settingsPage === 'security'
                      ? 'Security'
                        : settingsPage === 'account'
                          ? 'Account'
                          : settingsPage === 'appearance'
                            ? 'Appearance'
                            : settingsPage === 'permissions'
                              ? 'Permissions'
                              : settingsPage === 'help'
                                ? 'Help'
                                : 'About'}
            </Text>
          </View>
          <ScrollView>
            <FadeIn key={settingsPage ?? 'root'}>
            {settingsPage === null ? (
              <>
                <View style={styles.profileCard}>
                  <Avatar uri={me.avatar} size={64} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.profileCardName}>{me.name}</Text>
                    <Text style={styles.muted} numberOfLines={1}>
                      @{me.username} · {myCircles.length} circles · {myPosts.length} posts
                    </Text>
                  </View>
                  <Pressable
                    style={styles.profileCardBtn}
                    accessibilityLabel="View your profile"
                    accessibilityRole="button"
                    onPress={() => {
                      tap();
                      setSettingsOpen(false);
                      setTab('profile');
                    }}>
                    <Text style={styles.profileCardBtnTxt}>View</Text>
                  </Pressable>
                </View>
                <MenuRow icon="bell-outline" title="Notifications" onPress={() => setSettingsPage('notifications')} />
                <MenuRow icon="lock-outline" title="Privacy" onPress={() => setSettingsPage('privacy')} />
                <MenuRow icon="shield-check-outline" title="Security" onPress={() => setSettingsPage('security')} />
                <MenuRow icon="account-circle-outline" title="Account" onPress={() => setSettingsPage('account')} />
                <MenuRow icon="theme-light-dark" title="Appearance" onPress={() => setSettingsPage('appearance')} />
                <MenuRow icon="shield-outline" title="Permissions" onPress={() => setSettingsPage('permissions')} />
                <MenuRow icon="help-circle-outline" title="Help" onPress={() => setSettingsPage('help')} />
                <MenuRow icon="information-outline" title="About" onPress={() => setSettingsPage('about')} />
              </>
            ) : settingsPage === 'notifications' ? (
              <>
                <ToggleRow label="Likes" hint="vucms liked your photo." value={settings.notifLikes} onToggle={() => patchSettings({ notifLikes: !settings.notifLikes })} />
                <ToggleRow label="Comments" hint="Someone commented on your post." value={settings.notifComments} onToggle={() => patchSettings({ notifComments: !settings.notifComments })} />
                <ToggleRow label="Following and followers" hint="Someone followed you." value={settings.notifFollows} onToggle={() => patchSettings({ notifFollows: !settings.notifFollows })} />
                <ToggleRow label="Direct messages" hint="New message requests." value={settings.notifMessages} onToggle={() => patchSettings({ notifMessages: !settings.notifMessages })} />
                <ToggleRow label="Live and reels" hint="Accounts you follow go live." value={settings.notifLive} onToggle={() => patchSettings({ notifLive: !settings.notifLive })} />
                <ToggleRow label="Email and SMS" hint="Product updates and reminders." value={settings.notifEmailSms} onToggle={() => patchSettings({ notifEmailSms: !settings.notifEmailSms })} />
                <View style={{ paddingHorizontal: 12, gap: 8, marginTop: 8 }}>
                  <Pressable
                    style={styles.publish}
                    onPress={async () => {
                      const ok = await ensureNotifications();
                      setNotifMsg(ok ? 'Push notifications enabled.' : 'Permission denied — allow it in system settings.');
                      const s = await notificationsStatus();
                      setExtraPerms((p) => ({ ...p, notifications: s }));
                    }}>
                    <Text style={styles.publishTxt}>Enable push notifications</Text>
                  </Pressable>
                  <Pressable
                    style={styles.secondary}
                    onPress={async () => {
                      const ok = await sendTestNotification();
                      setNotifMsg(ok ? 'Test notification sent — check your tray.' : 'Could not send — permission denied.');
                    }}>
                    <Text style={styles.secondaryTxt}>Send test notification</Text>
                  </Pressable>
                  {notifMsg ? <Text style={styles.muted}>{notifMsg}</Text> : null}
                  <Pressable style={styles.miniFollow} onPress={() => Linking.openSettings()}>
                    <Text style={{ color: '#0095f6', fontWeight: '600' }}>Open system settings</Text>
                  </Pressable>
                </View>
              </>
            ) : settingsPage === 'privacy' ? (
              <>
                <ToggleRow label="Private account" hint={settings.privateAccount ? 'Only approved followers see your posts.' : 'Anyone can see your posts.'} value={settings.privateAccount} onToggle={() => patchSettings({ privateAccount: !settings.privateAccount })} />
                <ToggleRow label="Activity status" hint="Let others see when you are active." value={settings.activityStatus} onToggle={() => patchSettings({ activityStatus: !settings.activityStatus })} />
                <Text style={[styles.sectionTitle, { paddingHorizontal: 12, marginTop: 8 }]}>Close friends ({settings.closeFriends.length})</Text>
                {users.filter((u) => u.username !== ME).map((u) => (
                  <ToggleRow key={u.username} label={u.username} value={settings.closeFriends.includes(u.username)} onToggle={() => toggleSettingList('closeFriends', u.username)} />
                ))}
                <Text style={[styles.sectionTitle, { paddingHorizontal: 12, marginTop: 8 }]}>Muted ({settings.muted.length}) — tap to unmute</Text>
                {settings.muted.map((m) => (
                  <Pressable key={m} style={styles.thread} onPress={() => toggleSettingList('muted', m)}>
                    <Text style={[styles.postUser, { flex: 1 }]}>{m}</Text>
                    <Text style={{ color: '#0095f6' }}>Unmute</Text>
                  </Pressable>
                ))}
                <Text style={[styles.sectionTitle, { paddingHorizontal: 12, marginTop: 8 }]}>Blocked ({settings.blocked.length}) — tap to unblock</Text>
                {settings.blocked.map((m) => (
                  <Pressable key={m} style={styles.thread} onPress={() => toggleSettingList('blocked', m)}>
                    <Text style={[styles.postUser, { flex: 1 }]}>{m}</Text>
                    <Text style={{ color: '#0095f6' }}>Unblock</Text>
                  </Pressable>
                ))}
                <Text style={[styles.sectionTitle, { paddingHorizontal: 12, marginTop: 8 }]}>Restricted ({settings.restricted.length}) — tap to unrestrict</Text>
                {settings.restricted.map((m) => (
                  <Pressable key={m} style={styles.thread} onPress={() => toggleSettingList('restricted', m)}>
                    <Text style={[styles.postUser, { flex: 1 }]}>{m}</Text>
                    <Text style={{ color: '#0095f6' }}>Unrestrict</Text>
                  </Pressable>
                ))}
              </>
            ) : settingsPage === 'security' ? (
              <>
                <ToggleRow label="Two-factor authentication" hint="Extra code at login." value={settings.twoFactor} onToggle={() => patchSettings({ twoFactor: !settings.twoFactor })} />
                <ToggleRow label="Save login info" value={settings.savedLogin} onToggle={() => patchSettings({ savedLogin: !settings.savedLogin })} />
                <Text style={[styles.sectionTitle, { paddingHorizontal: 12, marginTop: 8 }]}>Change password</Text>
                <View style={{ paddingHorizontal: 12, gap: 8 }}>
                  <TextInput value={pw1} onChangeText={setPw1} placeholder="New password" secureTextEntry style={styles.input} />
                  <TextInput value={pw2} onChangeText={setPw2} placeholder="Repeat password" secureTextEntry style={styles.input} />
                  <Pressable style={styles.publish} onPress={changePassword}>
                    <Text style={styles.publishTxt}>Update password</Text>
                  </Pressable>
                  {pwMsg ? <Text style={styles.muted}>{pwMsg}</Text> : null}
                  {settings.passwordUpdatedAt ? (
                    <Text style={styles.muted}>Last changed {timeAgo(settings.passwordUpdatedAt)}</Text>
                  ) : null}
                </View>
                <Text style={[styles.sectionTitle, { paddingHorizontal: 12, marginTop: 8 }]}>Login activity</Text>
                {loginSessions.map((l) => (
                  <View key={`${l.device}-${l.where}-${l.when}`} style={styles.thread}>
                    <MaterialCommunityIcons name={l.current ? 'cellphone' : 'laptop'} size={22} color={C.text} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text, fontWeight: '600' }}>{l.device}</Text>
                      <Text style={styles.muted}>{l.where} · {timeAgo(l.when)}</Text>
                    </View>
                    {l.current ? (
                      <Text style={{ color: '#0095f6' }}>Active now</Text>
                    ) : (
                      <Pressable
                        style={styles.miniFollow}
                        accessibilityLabel={`Log out ${l.device}`}
                        accessibilityRole="button"
                        onPress={() => {
                          tap();
                          setLoginSessions((prev) =>
                            prev.filter((s) => `${s.device}-${s.where}-${s.when}` !== `${l.device}-${l.where}-${l.when}`),
                          );
                        }}>
                        <Text style={{ color: '#0095f6', fontWeight: '600' }}>Log out</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </>
            ) : settingsPage === 'account' ? (
              <>
                <Text style={[styles.sectionTitle, { paddingHorizontal: 12 }]}>Language</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12 }}>
                  {LANGUAGES.map((l) => (
                    <Pressable
                      key={l}
                      style={[styles.langChip, settings.language === l && styles.langChipOn]}
                      onPress={() => patchSettings({ language: l })}>
                      <Text style={settings.language === l ? { color: '#fff' } : { color: C.text }}>{l}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={[styles.sectionTitle, { paddingHorizontal: 12, marginTop: 8 }]}>Archived posts ({settings.archived.length})</Text>
                {settings.archived.length === 0 ? (
                  <Text style={[styles.muted, { paddingHorizontal: 12 }]}>Archive from any post's options menu.</Text>
                ) : (
                  settings.archived.map((id) => (
                    <View key={id} style={styles.thread}>
                      <Text style={[styles.postUser, { flex: 1 }]}>{id}</Text>
                      <Pressable style={styles.miniFollow} onPress={() => unarchivePost(id)}>
                        <Text style={{ color: '#0095f6', fontWeight: '600' }}>Unarchive</Text>
                      </Pressable>
                    </View>
                  ))
                )}
                <Text style={[styles.sectionTitle, { paddingHorizontal: 12, marginTop: 8 }]}>Stored data</Text>
                <View style={{ paddingHorizontal: 12, gap: 8 }}>
                  <Text style={styles.muted}>Posts, messages, follows and settings stay on this device.</Text>
                  <Pressable
                    style={styles.secondary}
                    onPress={() => {
                      if (confirmClear) resetAll();
                      else setConfirmClear(true);
                    }}>
                    <Text style={styles.secondaryTxt}>{confirmClear ? 'Tap again to erase everything' : 'Clear stored data'}</Text>
                  </Pressable>
                </View>
                <Text style={[styles.sectionTitle, { paddingHorizontal: 12, marginTop: 8 }]}>Request verification</Text>
                <View style={{ paddingHorizontal: 12, gap: 8 }}>
                  <TextInput value={verifyName} onChangeText={setVerifyName} placeholder="Full name" style={styles.input} />
                  <Pressable
                    style={styles.publish}
                    onPress={() => {
                      if (verifyName.trim()) setVerifySent(true);
                    }}>
                    <Text style={styles.publishTxt}>Submit request</Text>
                  </Pressable>
                  {verifySent ? <Text style={styles.muted}>Request submitted for {verifyName}.</Text> : null}
                </View>
              </>
            ) : settingsPage === 'appearance' ? (
              <View>
                <Text style={[styles.muted, { paddingHorizontal: 12, marginBottom: 8 }]}>
                  System follows your device setting.
                </Text>
                {(
                  [
                    { mode: 'light', title: 'Light', hint: 'White backgrounds, black text.' },
                    { mode: 'dark', title: 'Dark', hint: 'Black backgrounds, white text.' },
                    { mode: 'system', title: 'System', hint: 'Match your device appearance.' },
                  ] as const
                ).map((o) => (
                  <Pressable
                    key={o.mode}
                    style={styles.thread}
                    accessibilityLabel={`${o.title} theme`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: settings.theme === o.mode }}
                    onPress={() => {
                      tap();
                      patchSettings({ theme: o.mode });
                    }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text, fontWeight: '600' }}>{o.title}</Text>
                      <Text style={styles.muted}>{o.hint}</Text>
                    </View>
                    {settings.theme === o.mode ? (
                      <MaterialCommunityIcons name="check" size={22} color={C.text} />
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : settingsPage === 'permissions' ? (
              <View style={{ paddingHorizontal: 0 }}>
                <Text style={[styles.muted, { paddingHorizontal: 12, marginBottom: 8 }]}>
                  Circles asks for access only when you use a feature. Status: {extraPerms.location === 'granted' && extraPerms.contacts === 'granted' && extraPerms.notifications === 'granted' && camPerm?.granted && libPerm?.granted && micPerm?.granted ? 'all granted' : 'some missing'}.
                </Text>
                <PermRow label="Camera" hint={`Take photos and videos · ${camPerm?.status ?? 'loading'}`} granted={!!camPerm?.granted} onRequest={() => requestCamPerm()} />
                <PermRow label="Photos" hint={`Pick and save photos · ${libPerm?.status ?? 'loading'}`} granted={!!libPerm?.granted} onRequest={() => requestLibPerm()} />
                <PermRow label="Microphone" hint={`Record video with sound · ${micPerm?.status ?? 'loading'}`} granted={!!micPerm?.granted} onRequest={() => requestMicPerm()} />
                <PermRow label="Location" hint={`Tag places · ${extraPerms.location}`} granted={extraPerms.location === 'granted'} onRequest={tagPlace} />
                <PermRow label="Contacts" hint={`Find friends · ${extraPerms.contacts}`} granted={extraPerms.contacts === 'granted'} onRequest={importContacts} />
                <PermRow label="Notifications" hint={`Likes and messages · ${extraPerms.notifications}`} granted={extraPerms.notifications === 'granted'} onRequest={async () => { await ensureNotifications(); refreshExtraPerms(); }} />
                {pushNeedsDevBuild() ? (
                  <Text style={[styles.muted, { paddingHorizontal: 12, marginTop: 4 }]}>
                    Remote push needs a development build — permission prompts and test notifications here work as-is.
                  </Text>
                ) : null}
                <Pressable style={[styles.secondary, { marginHorizontal: 12 }]} onPress={() => Linking.openSettings()}>
                  <Text style={styles.secondaryTxt}>Open system settings</Text>
                </Pressable>
                <Text style={[styles.sectionTitle, { paddingHorizontal: 12, marginTop: 12 }]}>Phone contacts</Text>
                {contactsBusy ? (
                  <Shimmer>
                    <View style={{ paddingHorizontal: 12, gap: 10, paddingVertical: 8 }}>
                      {[0, 1, 2].map((i) => (
                        <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#8e8e93' }} />
                          <View style={{ flex: 1, height: 14, borderRadius: 7, backgroundColor: '#8e8e93' }} />
                        </View>
                      ))}
                    </View>
                  </Shimmer>
                ) : deviceContacts ? (
                  deviceContacts.length === 0 ? (
                    <View style={{ paddingHorizontal: 12 }}>
                      <Text style={styles.muted}>No contacts on this device.</Text>
                      <Pressable style={[styles.secondary, { alignSelf: 'flex-start' }]} onPress={importContacts}>
                        <Text style={styles.secondaryTxt}>Try again</Text>
                      </Pressable>
                    </View>
                  ) : (
                    deviceContacts.slice(0, 20).map((c) => (
                      <View key={c.id} style={styles.thread}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: C.text, fontWeight: '600' }}>{c.name}</Text>
                          {c.phone ? <Text style={styles.muted}>{c.phone}</Text> : null}
                        </View>
                        <Pressable
                          style={styles.miniFollow}
                          onPress={() => {
                            setInvited((prev) => new Set(prev).add(c.id));
                          }}>
                          <Text style={{ color: '#0095f6', fontWeight: '600' }}>
                            {invited.has(c.id) ? 'Invited ✓' : 'Invite'}
                          </Text>
                        </Pressable>
                      </View>
                    ))
                  )
                ) : (
                  <View style={{ paddingHorizontal: 12 }}>
                    <Pressable style={styles.publish} onPress={importContacts}>
                      <Text style={styles.publishTxt}>Import contacts</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ) : settingsPage === 'help' ? (
              <View style={{ paddingHorizontal: 12, gap: 8 }}>
                <Text style={styles.sectionTitle}>Report a problem</Text>
                <TextInput
                  value={reportText}
                  onChangeText={setReportText}
                  placeholder="Describe what went wrong..."
                  multiline
                  style={[styles.input, { minHeight: 90 }]}
                />
                <Pressable
                  style={styles.publish}
                  onPress={() => {
                    if (reportText.trim()) setReportSent(true);
                  }}>
                  <Text style={styles.publishTxt}>Send report</Text>
                </Pressable>
                {reportSent ? <Text style={styles.muted}>Thanks — report sent.</Text> : null}
                <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Help center</Text>
                <Text style={styles.muted}>Search help, privacy and safety tips live in the full app. This build stores everything on-device.</Text>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 12 }}>
                <Text style={styles.sectionTitle}>About</Text>
                <Text style={{ color: C.text }}>Circles v2.0.0</Text>
                <Text style={styles.muted}>Private moments with your people. Posts, messages and settings stay on this device.</Text>
                <Text style={[styles.muted, { marginTop: 8 }]}>Language: {settings.language}</Text>
              </View>
            )}
            </FadeIn>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (C: Theme) =>
  StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  logo: { fontFamily: 'GrandHotel_400Regular', fontSize: 32, color: C.text, flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.text, flex: 1, textAlign: 'center' },
  headerIcons: { flexDirection: 'row', gap: 20, alignItems: 'center' },
  storyStrip: { paddingHorizontal: 16, paddingVertical: 14 },
  storyItem: { alignItems: 'center', marginRight: 14, width: 78 },
  storyName: { fontSize: 11, color: C.text, marginTop: 4 },
  avatarRing: { padding: 2, borderColor: '#0095f6', backgroundColor: '#fff' },
  post: { marginBottom: 8, backgroundColor: C.bg },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  postUser: { fontWeight: '600', fontSize: 15, color: C.text, flex: 1 },
  postMeta: { color: C.muted, fontSize: 12, marginTop: 1 },
  postImage: { width: '100%', aspectRatio: 1, backgroundColor: C.fill },
  shopDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopDotInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff' },
  shopCard: {
    position: 'absolute',
    top: 34,
    left: -30,
    backgroundColor: C.sheet,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairline,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  shopLabel: { color: C.text, fontWeight: '700', fontSize: 13 },
  shopPrice: { color: C.muted, fontSize: 12, marginTop: 2 },
  postActions: { flexDirection: 'row', gap: 20, paddingHorizontal: 14, paddingVertical: 10 },
  likes: { fontWeight: '700', fontSize: 15, color: C.text, paddingHorizontal: 14, paddingTop: 10 },
  caption: { color: C.text, paddingHorizontal: 14, marginTop: 4, lineHeight: 20, fontSize: 14 },
  meta: { color: C.muted, paddingHorizontal: 12, marginTop: 4, marginBottom: 12, fontSize: 12 },
  tabFloat: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
  },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    paddingBottom: 22,
    overflow: 'hidden',
    backgroundColor: C.tabBar,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.hairline,
  },
  tabItem: {
    paddingVertical: 7,
    paddingHorizontal: 20,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemOn: { backgroundColor: C.tabPill },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: C.muted },
  sectionTitle: { fontWeight: '700', color: C.text, fontSize: 16, marginBottom: 8 },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.fill,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 15, padding: 0 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  discoverRow: { paddingLeft: 12, paddingRight: 4 },
  discoverCard: { alignItems: 'center', width: 96, marginRight: 12, gap: 6 },
  discoverName: { fontSize: 12, fontWeight: '600', color: C.text },
  followPill: {
    backgroundColor: '#0095F6',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 16,
    alignSelf: 'center',
  },
  followPillTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  clearTxt: { color: '#0095F6', fontWeight: '600', fontSize: 14 },
  thread: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  contactChip: { alignItems: 'center', marginRight: 12, width: 64 },
  chipName: { fontSize: 11, color: C.text, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33.33%', aspectRatio: 1, padding: 0.5 },
  cellImg: { flex: 1, backgroundColor: C.fill, borderRadius: 1 },
  viewBadge: { position: 'absolute', left: 6, bottom: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewTxt: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  composer: { flexDirection: 'row', gap: 8, padding: 12, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.hairline,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: C.text,
    backgroundColor: C.inputBg,
  },
  sendBtn: { backgroundColor: '#0095f6', borderRadius: 20, padding: 10 },
  bubble: { maxWidth: '80%', borderRadius: 16, padding: 10, marginVertical: 4 },
  bubbleMine: { backgroundColor: '#0095f6', alignSelf: 'flex-end' },
  bubbleTheirs: { backgroundColor: C.fill, alignSelf: 'flex-start' },
  profileHead: { flexDirection: 'row', alignItems: 'center', gap: 18, padding: 12 },
  stat: { alignItems: 'center', flex: 1 },
  statN: { fontWeight: '700', fontSize: 16, color: C.text },
  followBtn: {
    backgroundColor: '#0095f6',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  followingBtn: { backgroundColor: C.fill },
  followTxt: { color: '#fff', fontWeight: '700' },
  miniFollow: { padding: 6 },
  profileTabs: { flexDirection: 'row', gap: 20, marginTop: 12, paddingHorizontal: 4 },
  profileBtn: {
    backgroundColor: C.fill,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  profileBtnTxt: { color: C.text, fontWeight: '600', fontSize: 14 },
  profileTab: { color: '#8e8e93', fontWeight: '600', fontSize: 15, paddingBottom: 6, paddingHorizontal: 2 },
  profileTabOn: { color: C.text, borderBottomWidth: 2, borderBottomColor: C.text },
  seedRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  seed: { width: 52, height: 52, borderRadius: 8, backgroundColor: C.fill },
  toneSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.hairline,
  },
  publish: {
    backgroundColor: '#0095f6',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginTop: 4,
  },
  publishTxt: { color: '#fff', fontWeight: '700' },
  secondary: {
    backgroundColor: C.fill,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryTxt: { color: C.text, fontWeight: '600', fontSize: 14 },
  chipTxt: { color: C.text, fontSize: 14 },
  storyFull: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'flex-end',
  },
  storyUser: { color: '#fff', fontWeight: '700', fontSize: 15 },
  storyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  storyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: C.sheet, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 },
  tag: { color: C.link, fontWeight: '600' },
  storyAdd: {
    position: 'absolute',
    right: 2,
    bottom: 20,
    backgroundColor: '#0095f6',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  reelBadge: {
    position: 'absolute',
    right: 6,
    top: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    padding: 3,
  },
  reel: { height: REEL_HEIGHT, backgroundColor: '#000', justifyContent: 'flex-end' },
  reelScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 260,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  reelTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  reelTitle: { color: '#fff', fontWeight: '700', fontSize: 22 },
  reelCounter: {
    position: 'absolute',
    top: 56,
    right: 16,
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  reelFriends: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  reelFriendsOn: { borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.25)' },
  reelFriendAvatar: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#fff' },
  reelFriendsTxt: { color: '#fff', fontWeight: '600', fontSize: 14 },
  reelGlassBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reelFollow: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  reelFollowTxt: { color: '#000', fontWeight: '700', fontSize: 13 },
  reelSide: { position: 'absolute', right: 16, bottom: 140, alignItems: 'center', gap: 16 },
  reelCount: { color: '#fff', textAlign: 'center', fontSize: 12, fontWeight: '600' },
  reelBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 150 },
  reelUser: { color: '#fff', fontWeight: '700', fontSize: 15 },
  reelCircle: {
    color: '#fff',
    fontSize: 11,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  reelCap: { color: '#fff', marginTop: 8, fontSize: 14, lineHeight: 19 },
  reelAudio: { color: '#fff', fontSize: 12 },
  reelVote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  reelVoteTxt: { color: '#fff', fontWeight: '600', fontSize: 14 },
  reelMore: { position: 'absolute', right: 16, bottom: 230 },
  switch: {
    width: 51,
    height: 31,
    borderRadius: 16,
    backgroundColor: C.hairline,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  switchOn: { backgroundColor: '#34C759' },
  knob: { width: 27, height: 27, borderRadius: 14, backgroundColor: '#fff' },
  knobOn: { alignSelf: 'flex-end' },
  langChip: { borderWidth: 1, borderColor: C.hairline, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  langChipOn: { backgroundColor: '#0095f6', borderColor: '#0095f6' },
  noteCell: { width: 84, alignItems: 'center', marginRight: 10 },
  noteBubble: {
    backgroundColor: C.fill,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: -10,
    maxWidth: 84,
    minHeight: 32,
    justifyContent: 'center',
    zIndex: 2,
    elevation: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairline,
  },
  noteFullWrap: { flex: 1, backgroundColor: C.bg },
  noteFull: { flex: 1, alignSelf: 'stretch', paddingHorizontal: 16, paddingTop: 12 },
  notePill: {
    alignSelf: 'center',
    backgroundColor: C.fill,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 12,
    minWidth: 130,
  },
  notePillInput: { color: C.text, fontSize: 16, textAlign: 'center', padding: 0 },
  noteMusicBadge: {
    position: 'absolute',
    right: 0,
    bottom: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E1306C',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.bg,
  },
  noteMediaRow: { flexDirection: 'row', gap: 12, justifyContent: 'center', marginTop: 20 },
  noteMediaBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairline,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  noteSongBig: { color: C.text, fontSize: 15, fontWeight: '600', textAlign: 'center', marginTop: 14 },
  noteHint: { color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 10 },
  noteBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
  },
  noteAudience: { color: C.text, fontWeight: '600', fontSize: 15 },
  noteShareBtn: { backgroundColor: '#3A3AB8', borderRadius: 22, paddingVertical: 12, paddingHorizontal: 28 },
  noteShareTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
  audioChip: {
    backgroundColor: C.fill,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  audioChipOn: { backgroundColor: '#fff' },
  audioChipTxt: { color: C.text, fontWeight: '600', fontSize: 15 },
  audioChipTxtOn: { color: '#000' },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  songArt: { width: 52, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  songTitle: { color: C.text, fontWeight: '700', fontSize: 16 },
  noteText: { fontSize: 12, color: C.text, textAlign: 'center' },
  noteSong: { fontSize: 10, color: C.muted, textAlign: 'center', marginTop: 2 },
  noteBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  noteCard: {
    width: '100%',
    maxWidth: 340,
    maxHeight: '85%',
    backgroundColor: C.sheet,
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  noteCardName: { fontWeight: '700', fontSize: 17, color: C.text, marginTop: 4 },
  noteBig: { fontSize: 18, color: C.text, textAlign: 'center', lineHeight: 24, marginVertical: 8 },
  noteSongRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.fill,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  permDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.hairline },
  permDotOn: { backgroundColor: '#34c759' },
  permDotOff: { backgroundColor: '#ff3b30' },
  bootLogo: { fontFamily: 'GrandHotel_400Regular', fontSize: 52, color: C.text, marginBottom: 16 },
  burstWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  reqBtn: { backgroundColor: '#0095f6', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  badgeDot: {
    position: 'absolute',
    right: -2,
    top: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.like,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#0095f6' },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#0095F6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  dmThread: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  dmName: { fontWeight: '700', fontSize: 16, color: C.text },
  dmSnippet: { color: C.muted, fontSize: 14, marginTop: 2 },
  dmTime: { color: C.muted, fontSize: 12 },
  dmTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  dmTab: { fontSize: 17, fontWeight: '700', color: C.muted },
  dmTabOn: { color: C.text },
  composeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeDot: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#34c759',
    borderWidth: 2,
    borderColor: '#fff',
  },
  chip: {
    borderWidth: 1,
    borderColor: C.hairline,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: C.fill,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
  },
  settingsRowTxt: { flex: 1, fontSize: 16, color: ThemeRef.colors.text },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.fill,
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    padding: 14,
  },
  profileCardName: { fontWeight: '700', fontSize: 17, color: C.text },
  profileCardBtn: {
    backgroundColor: '#0095F6',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  profileCardBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  feedSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flex: 1,
    justifyContent: 'center',
  },
  feedSwitcherTxt: { fontSize: 20, fontWeight: '800', color: C.text },
  feedMenuWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    zIndex: 30,
    elevation: 30,
  },
  feedMenu: {
    marginTop: 108,
    width: 250,
    backgroundColor: C.sheet,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairline,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
  },
  circleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  circleOptionTxt: { flex: 1, fontSize: 15, fontWeight: '600', color: C.text },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.hairline,
    alignSelf: 'center',
    marginBottom: 8,
  },
  callBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.hairline,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.hairline,
    backgroundColor: C.bg,
  },
  chatName: { fontWeight: '700', fontSize: 16, color: C.text },
  chatStatus: { color: C.muted, fontSize: 12, marginTop: 1 },
  chatCallBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPill: {
    color: C.muted,
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: C.fill,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  hlEmpty: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    borderColor: C.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hlNew: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.muted,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg,
  },
  hlInput: {
    borderWidth: 1,
    borderColor: C.hairline,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: 68,
    textAlign: 'center',
    color: C.text,
  },
});

type Styles = ReturnType<typeof makeStyles>;
const styleSets = { light: makeStyles(LightTheme), dark: makeStyles(DarkTheme) };
// Render-safe proxy: App sets ThemeRef every render; module-level components
// keep using `styles.*` with zero prop changes.
const styles = new Proxy({} as Styles, {
  get: (_t, p: string) => (styleSets[ThemeRef.mode] as unknown as Record<string, unknown>)[p],
});

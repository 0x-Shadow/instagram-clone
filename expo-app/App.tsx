import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
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
  saveToLibrary,
  sendTestNotification,
  takePhoto,
  ensureNotifications,
  pushNeedsDevBuild,
  type DeviceContact,
} from './src/device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_VERSION, createPersistence } from './src/persistence';
import { success, tap } from './src/haptics';
import {
  ME,
  SEED_MESSAGES,
  SEED_POSTS,
  SEED_STORIES,
  SEED_USERS,
  buildActivity,
  conversationWith,
  extractHashtags,
  inboxThreads,
  searchPosts,
  searchUsers,
  timeAgo,
  toggleInList,
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

function Avatar({
  uri,
  size = 32,
  ring = false,
}: {
  uri: string;
  size?: number;
  ring?: boolean | 'close' | 'seen';
}) {
  const borderColor = ring === 'close' ? '#34c759' : ring === 'seen' ? '#d9d9d9' : '#d62976';
  const outer = size + 10;
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

function ToggleRow({ label, hint, value, onToggle }: { label: string; hint?: string; value: boolean; onToggle: () => void }) {
  return (
    <Pressable style={styles.thread} onPress={onToggle}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: ThemeRef.colors.text, fontWeight: '600' }}>{label}</Text>
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
    <Pressable style={styles.thread} onPress={onPress}>
      <MaterialCommunityIcons name={icon as never} size={22} color={ThemeRef.colors.text} />
      <Text style={[styles.postUser, { flex: 1 }]}>{title}</Text>
      <MaterialCommunityIcons name="chevron-right" size={22} color={ThemeRef.colors.muted} />
    </Pressable>
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
      accessibilityState={selected === undefined ? undefined : { selected }}>
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
  const [profileMode, setProfileMode] = useState<'posts' | 'saved' | 'archive'>('posts');
  const [storyIndex, setStoryIndex] = useState<number | null>(null);
  const [storyPage, setStoryPage] = useState(0);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [draftComment, setDraftComment] = useState('');
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState('');
  const [createCaption, setCreateCaption] = useState('');
  const [createSeed, setCreateSeed] = useState(CREATE_SEEDS[0]);
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<string | null>(null);
  const [reelIndex, setReelIndex] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [storySeed, setStorySeed] = useState('mystory1');
  const [optionsPostId, setOptionsPostId] = useState<string | null>(null);
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
  const [exploreMode, setExploreMode] = useState<'posts' | 'reels'>('posts');

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
        setStories(saved.stories);
        setMessages(saved.messages);
        setFollows(saved.follows);
        setBookmarks(new Set(saved.bookmarks));
        setInvited(new Set(saved.invited));
        setSettings({ ...DEFAULT_SETTINGS, ...saved.settings });
        setReadThreads(new Set(saved.readThreads));
        setSeenActivityAt(saved.seenActivityAt);
        setSearchHistory(saved.searchHistory);
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
      });
    }, 500);
    return () => clearTimeout(t);
  }, [hydrated, users, posts, stories, messages, follows, bookmarks, invited, settings, readThreads, seenActivityAt, searchHistory]);

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
          setComposerOpen(true);
        } else {
          setPickedUri(photo.uri);
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
  const visiblePosts = useMemo(
    () => posts.filter((p) => !settings.blocked.includes(p.username)),
    [posts, settings.blocked],
  );
  const filteredUsers = useMemo(
    () => searchUsers(users, query, undefined).filter((u) => !settings.blocked.includes(u.username)),
    [users, query, settings.blocked],
  );
  const filteredPosts = useMemo(() => searchPosts(visiblePosts, query), [visiblePosts, query]);
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
      const safeIndex = Math.max(0, Math.min(reelIndex, Math.max(filteredPosts.length - 1, 0)));
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
  }, [tab, reelIndex, filteredPosts.length]);

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
    setPosts((prev) => [
      {
        id,
        username: ME,
        image: pickedUri ?? createPhoto(createSeed),
        caption,
        likes: [],
        comments: [],
        createdAt: Date.now(),
      },
      ...prev,
    ]);
    setCreateCaption('');
    setPickedUri(null);
    setPlaceTag(null);
    setSaveMsg('');
    setCreateOpen(false);
    setTab('home');
  }, [createCaption, createSeed, pickedUri, placeTag]);

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

  const addStory = useCallback(() => {
    success();
    const uri = storyUri ?? `https://picsum.photos/seed/${storySeed}/540/960`;
    setStories((prev) => {
      const mine = prev.find((s) => s.username === ME);
      if (mine) {
        return prev.map((s) =>
          s.username === ME ? { ...s, images: [uri, ...s.images], seen: false } : s,
        );
      }
      return [{ username: ME, images: [uri], seen: false }, ...prev];
    });
    setStoryUri(null);
    setComposerOpen(false);
  }, [storySeed, storyUri]);

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
    return (
      <View style={styles.post}>
        <View style={styles.postHeader}>
          <Pressable
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
            onPress={() => setProfileName(item.username)}>
            <Avatar uri={author.avatar} size={32} />
            <Text style={styles.postUser}>{item.username}</Text>
          </Pressable>
          <Pressable onPress={() => setOptionsPostId(item.id)} hitSlop={8}>
            <MaterialCommunityIcons name="dots-horizontal" size={20} color={C.text} />
          </Pressable>
        </View>
        <Pressable onPress={() => toggleLike(item.id)}>
          <Image
            source={{ uri: item.image }}
            style={styles.postImage}
            placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
            contentFit="cover"
            transition={200}
          />
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
            onPress={() => toggleLike(item.id)}
            color={liked ? C.like : C.text}
          />
          <IconBtn icon="comment-outline" label="View comments" onPress={() => setCommentsPostId(item.id)} />
          <IconBtn
            icon="send-outline"
            label="Share to Direct"
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
            onPress={() => toggleBookmark(item.id)}
          />
        </View>
        <Text style={styles.likes}>{item.likes.length} likes</Text>
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
  const viewerImages = viewer ? viewer.images : [];
  const viewerName = viewer ? viewer.username : '';
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
      <SafeAreaView style={[styles.safe, styles.center]} edges={['top', 'left', 'right']}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <Text style={styles.bootLogo}>Instagram</Text>
        <ActivityIndicator size="large" color="#0095F6" />
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
          <Text style={styles.headerTitle}>
            {activeChat ??
              (profileUser?.username ?? (tab === 'direct'
                ? 'Direct'
                : createOpen
                  ? 'New post'
                  : activityOpen
                    ? 'Activity'
                    : me.username))}
          </Text>
        ) : (
          <Text style={styles.logo}>Instagram</Text>
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
                  icon="cog-outline"
                  label="Settings"
                  onPress={() => {
                    setSettingsPage(null);
                    setSettingsOpen(true);
                  }}
                />
              </>
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

      {/* Direct inbox */}
      {tab === 'direct' && !activeChat ? (
        <FlatList
          data={threads}
          keyExtractor={(t) => t.other}
          ListHeaderComponent={
            <View style={{ padding: 12 }}>
              <Text style={styles.sectionTitle}>Notes</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <Pressable
                  style={styles.noteCell}
                  accessibilityLabel={notes[ME] ? 'Edit your note' : 'Leave a note'}
                  accessibilityRole="button"
                  onPress={() => {
                    setNoteDraft(notes[ME] ?? '');
                    setNoteEditing((v) => !v);
                  }}>
                  <View style={styles.noteBubble}>
                    <Text style={styles.noteText} numberOfLines={2}>
                      {notes[ME] ?? 'Leave a note'}
                    </Text>
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
                      onPress={() => setActiveChat(u)}>
                      <View style={styles.noteBubble}>
                        <Text style={styles.noteText} numberOfLines={2}>
                          {text}
                        </Text>
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
          }
          renderItem={({ item }) => {
            const u = userByName(users, item.other);
            const unread = item.last.from !== ME && !readThreads.has(item.other);
            return (
              <Pressable style={styles.thread} onPress={() => setActiveChat(item.other)}>
                <View>
                  <Avatar uri={u.avatar} size={44} />
                  <View style={styles.activeDot} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.postUser, unread && { fontWeight: '700' }]}>{item.other}</Text>
                  <Text numberOfLines={1} style={[styles.muted, unread && { color: C.text, fontWeight: '600' }]}>
                    {item.last.from === ME ? `You: ${item.last.text}` : item.last.text} ·{' '}
                    {timeAgo(item.last.createdAt)}
                  </Text>
                </View>
                {unread ? <View style={styles.unreadDot} /> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.muted}>No messages yet — start one from Contacts.</Text>
            </View>
          }
        />
      ) : activeChat ? (
        <View style={{ flex: 1 }}>
          <View style={styles.callBar}>
            <IconBtn
              icon="phone-outline"
              label="Start voice call"
              size={24}
              onPress={() => setCallState({ with: activeChat, video: false, muted: false })}
            />
            <IconBtn
              icon="video-outline"
              label="Start video call"
              onPress={() => setCallState({ with: activeChat, video: true, muted: false })}
            />
            <View style={{ flex: 1 }} />
            <IconBtn icon="dots-horizontal" label="Conversation options" size={22} onPress={() => setConvOptions(true)} />
          </View>
          <FlatList
            data={chatMessages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: 12 }}
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
                      <Text>{chip}</Text>
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
            <Text style={{ color: C.text }}>{profileUser.bio}</Text>
            {profileUser.username !== ME ? (
              <Pressable
                style={[
                  styles.followBtn,
                  myFollowing.includes(profileUser.username) && styles.followingBtn,
                ]}
                onPress={() => toggleFollow(profileUser.username)}>
                <Text
                  style={[
                    styles.followTxt,
                    myFollowing.includes(profileUser.username) && { color: C.text },
                  ]}>
                  {myFollowing.includes(profileUser.username) ? 'Following' : 'Follow'}
                </Text>
              </Pressable>
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
                <Text>Unblock</Text>
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
      ) : tab === 'home' ? (
        <FlatList
          data={visiblePosts}
          keyExtractor={(p) => p.id}
          renderItem={renderPost}
          ListHeaderComponent={
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.storyStrip}>
              <Pressable style={styles.storyItem} onPress={() => setComposerOpen(true)}>
                <View>
                  <Avatar uri={me.avatar} size={56} ring={false} />
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
                    size={56}
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
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.muted}>No posts yet.</Text>
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
      ) : tab === 'reels' ? (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
            <Text style={[styles.sectionTitle, { color: '#fff', flex: 1, marginBottom: 0 }]}>Reels</Text>
            <Pressable
              hitSlop={8}
              accessibilityLabel="Open camera"
              accessibilityRole="button"
              onPress={() => setCameraOpen('story')}>
              <MaterialCommunityIcons name="camera-outline" size={26} color="#fff" />
            </Pressable>
          </View>
          <FlatList
            ref={reelsRef}
            data={filteredPosts}
            keyExtractor={(p) => p.id}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            getItemLayout={(_data, index) => ({ length: 520, offset: 520 * index, index })}
            onScrollToIndexFailed={() => undefined}
            onViewableItemsChanged={({ viewableItems }) => {
              if (viewableItems[0]?.index != null) setReelIndex(viewableItems[0].index);
            }}
            viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
            renderItem={({ item, index }) => {
              const liked = item.likes.includes(ME);
              return (
                <View style={styles.reel}>
                  <Image
                    source={{ uri: item.image }}
                    style={{ width: '100%', height: 420, borderRadius: 12 }}
                    contentFit="cover"
                  />
                  <View style={styles.reelSide}>
                    <Pressable
                      hitSlop={8}
                      accessibilityLabel={liked ? 'Unlike reel' : 'Like reel'}
                      accessibilityRole="button"
                      onPress={() => toggleLike(item.id)}>
                      <MaterialCommunityIcons
                        name={liked ? 'heart' : 'heart-outline'}
                        size={30}
                        color={liked ? C.like : '#fff'}
                      />
                      <Text style={styles.reelCount}>{item.likes.length}</Text>
                    </Pressable>
                    <Pressable
                      hitSlop={8}
                      accessibilityLabel="View reel comments"
                      accessibilityRole="button"
                      onPress={() => setCommentsPostId(item.id)}>
                      <MaterialCommunityIcons name="comment-outline" size={30} color="#fff" />
                      <Text style={styles.reelCount}>{item.comments.length}</Text>
                    </Pressable>
                    <Pressable
                      hitSlop={8}
                      accessibilityLabel="Share reel to Direct"
                      accessibilityRole="button"
                      onPress={() => {
                        setTab('direct');
                        setActiveChat(item.username === ME ? 'ana' : item.username);
                      }}>
                      <MaterialCommunityIcons name="send-outline" size={28} color="#fff" />
                    </Pressable>
                  </View>
                  <Text style={styles.reelCap} numberOfLines={2}>
                    <Text style={{ fontWeight: '700' }}>@{item.username} </Text>
                    {item.caption} · {index + 1}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <MaterialCommunityIcons name="music" size={13} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 12 }} numberOfLines={1}>
                      Original audio · {item.username}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        </View>
      ) : tab === 'search' ? (
        <View style={{ flex: 1 }}>
          <View style={{ padding: 12 }}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search people, captions, #tags"
              style={styles.search}
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={() => rememberSearch(query)}
            />
            <View style={styles.profileTabs}>
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
            </View>
          </View>
          {exploreMode === 'reels' ? (
            <ScrollView>
            <View style={styles.grid}>
              {filteredPosts.map((p, i) => (
                <Pressable
                  key={p.id}
                  style={styles.cell}
                  onPress={() => {
                    setReelIndex(i);
                    setTab('reels');
                  }}>
                  <Image source={{ uri: p.image }} style={styles.cellImg} contentFit="cover" />
                  <View style={styles.reelBadge}>
                    <MaterialCommunityIcons name="play" size={16} color="#fff" />
                  </View>
                </Pressable>
              ))}
            </View>
            </ScrollView>
          ) : (
          <ScrollView>
            {query.trim() === '' ? (
              <>
                <Text style={[styles.sectionTitle, { paddingHorizontal: 12 }]}>
                  Discover people
                </Text>
                <Pressable
                  style={styles.thread}
                  onPress={() => {
                    setSettingsOpen(true);
                    setSettingsPage('permissions');
                  }}>
                  <MaterialCommunityIcons name="account-plus-outline" size={22} color={C.text} />
                  <Text style={[styles.postUser, { flex: 1 }]}>Find friends from phone contacts</Text>
      <MaterialCommunityIcons name="chevron-right" size={22} color={ThemeRef.colors.muted} />
                </Pressable>
                {users
                  .filter((u) => u.username !== ME && !myFollowing.includes(u.username) && !settings.blocked.includes(u.username))
                  .slice(0, 4)
                  .map((u) => (
                    <View key={u.username} style={styles.thread}>
                      <Pressable
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
                        onPress={() => openProfile(u.username, u.username)}>
                        <Avatar uri={u.avatar} size={40} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.postUser}>{u.username}</Text>
                          <Text style={styles.muted}>Tap to view profile</Text>
                        </View>
                      </Pressable>
                      <Pressable style={styles.miniFollow} onPress={() => toggleFollow(u.username)}>
                        <Text style={{ color: '#0095f6', fontWeight: '600' }}>Follow</Text>
                      </Pressable>
                    </View>
                  ))}
                {searchHistory.length > 0 ? (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginTop: 8 }}>
                      <Text style={[styles.sectionTitle, { flex: 1 }]}>Recent</Text>
                      <Pressable
                        style={styles.miniFollow}
                        accessibilityLabel="Clear search history"
                        accessibilityRole="button"
                        onPress={() => setSearchHistory([])}>
                        <Text style={{ color: '#0095f6', fontWeight: '600' }}>Clear</Text>
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
              </>
            ) : null}
            <Text style={[styles.sectionTitle, { paddingHorizontal: 12 }]}>People</Text>
            {filteredUsers.map((u) => (
              <View key={u.username} style={styles.thread}>
                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
                  onPress={() => openProfile(u.username, query.trim() || u.username)}>
                  <Avatar uri={u.avatar} size={40} />
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
            <Text style={[styles.sectionTitle, { paddingHorizontal: 12, marginTop: 8 }]}>Posts</Text>
            <View style={styles.grid}>
              {filteredPosts.map((p) => (
                <Pressable key={p.id} style={styles.cell} onPress={() => setCommentsPostId(p.id)}>
                  <Image source={{ uri: p.image }} style={styles.cellImg} contentFit="cover" />
                </Pressable>
              ))}
            </View>
            {filteredPosts.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.muted}>No posts match “{query}”.</Text>
                <Pressable style={[styles.secondary, { marginTop: 8 }]} onPress={() => setQuery('')}>
                  <Text>Clear search</Text>
                </Pressable>
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
              <Text style={{ color: C.text, fontWeight: '600' }}>Close</Text>
            </Pressable>
            <Text style={[styles.sectionTitle, { flex: 1, textAlign: 'center', marginBottom: 0 }]}>New post</Text>
            <Pressable
              style={styles.miniFollow}
              accessibilityLabel="Share post"
              accessibilityRole="button"
              onPress={publishPost}>
              <Text style={{ color: '#0095f6', fontWeight: '700' }}>Share</Text>
            </Pressable>
          </View>
          <Image
            source={{ uri: pickedUri ?? createPhoto(createSeed) }}
            style={{ width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: '#efefef' }}
            contentFit="cover"
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Pressable
              style={styles.secondary}
              onPress={async () => {
                const photo = await takePhoto();
                if (photo) {
                  setPickedUri(photo.uri);
                  setPhotoMsg('');
                } else {
                  setPhotoMsg('Camera permission is needed. Allow it in Settings › Permissions.');
                }
              }}>
              <Text>Take photo</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={async () => {
                const photo = await pickFromLibrary();
                if (photo) {
                  setPickedUri(photo.uri);
                  setPhotoMsg('');
                } else {
                  setPhotoMsg('Photo access is needed. Allow it in Settings › Permissions.');
                }
              }}>
              <Text>Choose from library</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={() => setCameraOpen('create')}>
              <Text>In-app camera</Text>
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
          {pickedUri ? (
            <Pressable style={styles.miniFollow} onPress={() => setPickedUri(null)}>
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
            placeholder="Write a caption... try #travel"
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
                <Text>Save photo to library</Text>
              </Pressable>
              {saveMsg ? <Text style={styles.muted}>{saveMsg}</Text> : null}
            </View>
          ) : null}
        </ScrollView>
      ) : activityOpen ? (
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, paddingBottom: 0 }}>
            <Pressable
              hitSlop={8}
              accessibilityLabel="Close activity"
              accessibilityRole="button"
              onPress={() => setActivityOpen(false)}>
              <MaterialCommunityIcons name="chevron-left" size={28} color={C.text} />
            </Pressable>
            <Text style={[styles.sectionTitle, { flex: 1, textAlign: 'center', marginBottom: 0 }]}>Activity</Text>
            <View style={{ width: 28 }} />
          </View>
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
                      <Text>Decline</Text>
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
              <Avatar uri={me.avatar} size={64} />
              <Text style={{ color: '#0095f6', fontSize: 11, textAlign: 'center', marginTop: 2 }}>
                Edit photo
              </Text>
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
                    <Text>Cancel</Text>
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
                <Text style={{ color: '#0095f6', marginTop: 4 }}>Edit profile</Text>
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
                    <Avatar uri={h.images[0]} size={52} ring={false} />
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
                  <MaterialCommunityIcons name="plus" size={28} color="#000" />
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
                  { mode: 'saved', icon: 'bookmark-outline', label: 'Saved posts' },
                  { mode: 'archive', icon: 'archive-outline', label: 'Archived posts' },
                ] as const
              ).map((t) => {
                const count =
                  t.mode === 'saved'
                    ? `, ${savedPosts.length}`
                    : t.mode === 'archive'
                      ? `, ${settings.archived.length}`
                      : '';
                const on = profileMode === t.mode;
                return (
                  <Pressable
                    key={t.mode}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: 8,
                      borderBottomWidth: on ? 1.5 : 0,
                      borderBottomColor: '#000',
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
                <Text>{activeCollection} ✕</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.grid}>
            {(profileMode === 'posts'
              ? myPosts.filter((p) => !settings.archived.includes(p.id))
              : profileMode === 'saved'
                ? activeCollection
                  ? savedPosts.filter(
                      (p) =>
                        settings.collections.find((c) => c.name === activeCollection)?.ids.includes(p.id) ?? false,
                    )
                  : savedPosts
                : posts.filter((p) => settings.archived.includes(p.id))
            ).map((p) => (
              <Pressable key={p.id} style={styles.cell} onPress={() => setCommentsPostId(p.id)}>
                <Image source={{ uri: p.image }} style={styles.cellImg} contentFit="cover" />
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
          {profileMode === 'archive' ? (
            <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
              {settings.archived.length === 0 ? (
                <Text style={styles.muted}>Nothing archived. Archive any post from its ••• menu and it will wait for you here.</Text>
              ) : (
                posts
                  .filter((p) => settings.archived.includes(p.id))
                  .map((p) => (
                    <View key={p.id} style={styles.thread}>
                      <Text style={[styles.postUser, { flex: 1 }]}>{p.caption.slice(0, 40)}</Text>
                      <Pressable style={styles.miniFollow} onPress={() => unarchivePost(p.id)}>
                        <Text style={{ color: '#0095f6', fontWeight: '600' }}>Unarchive</Text>
                      </Pressable>
                    </View>
                  ))
              )}
            </View>
          ) : null}
        </ScrollView>
      )}

      {/* Bottom tabs */}
      {!activeChat && !profileUser && !createOpen && !activityOpen ? (
        <View style={styles.tabBar}>
          <IconBtn
            icon={tab === 'home' ? 'home' : 'home-outline'}
            label="Home feed"
            size={28}
            selected={tab === 'home'}
            color={tab === 'home' ? C.text : C.muted}
            onPress={() => setTab('home')}
          />
          <IconBtn
            icon="play-box-outline"
            label="Reels"
            size={28}
            selected={tab === 'reels'}
            color={tab === 'reels' ? C.text : C.muted}
            onPress={() => setTab('reels')}
          />
          <Pressable
            onPress={() => setTab('direct')}
            hitSlop={8}
            accessibilityLabel={unreadCount > 0 ? `Direct messages, ${unreadCount} unread` : 'Direct messages'}
            accessibilityRole="button"
            accessibilityState={{ selected: tab === 'direct' }}>
            <View>
              <MaterialCommunityIcons
                name={tab === 'direct' ? 'send' : 'send-outline'}
                size={28}
                color={C.text}
              />
              {unreadCount > 0 ? <View style={styles.badgeDot} /> : null}
            </View>
          </Pressable>
          <IconBtn
            icon="magnify"
            label="Search and explore"
            size={28}
            selected={tab === 'search'}
            color={tab === 'search' ? C.text : C.muted}
            onPress={() => setTab('search')}
          />
          <Pressable
            onPress={() => setTab('profile')}
            hitSlop={8}
            accessibilityLabel="Your profile"
            accessibilityRole="button"
            accessibilityState={{ selected: tab === 'profile' }}>
            <Avatar uri={me.avatar} size={24} ring={tab === 'profile'} />
          </Pressable>
        </View>
      ) : null}

      {/* Story viewer */}
      <Modal visible={viewer !== null} animationType="fade" transparent>
        <View style={styles.storyFull}>
          {viewer ? (
            <>
              <View style={{ flexDirection: 'row', gap: 4, width: '100%', marginBottom: 8 }}>
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
              <Pressable
                accessibilityLabel="Next story image"
                accessibilityRole="button"
                onPress={() => {
                  if (storyPage + 1 < viewerImages.length) setStoryPage(storyPage + 1);
                  else closeStory();
                }}>
                <Image
                  source={{ uri: viewerImages[storyPage % viewerImages.length] }}
                  style={{ width: '100%', height: '75%', borderRadius: 12 }}
                  contentFit="cover"
                />
              </Pressable>
              <Text style={styles.storyUser}>{viewerName}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' }}>
                <Pressable
                  style={styles.secondary}
                  onPress={() =>
                    setStoryPage((p) => (p > 0 ? p - 1 : viewerImages.length - 1))
                  }>
                  <Text>Prev</Text>
                </Pressable>
                <Pressable
                  style={styles.secondary}
                  onPress={() => {
                    if (storyPage + 1 < viewerImages.length) setStoryPage(storyPage + 1);
                    else closeStory();
                  }}>
                  <Text>Next</Text>
                </Pressable>
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
                    size={26}
                    color={storyLiked.has(`${viewerName}:${storyPage}`) ? C.like : '#fff'}
                  />
                </Pressable>
                <Pressable style={styles.publish} onPress={closeStory}>
                  <Text style={styles.publishTxt}>Close</Text>
                </Pressable>
              </View>
              {viewerName !== ME ? (
                <View style={[styles.composer, { width: '100%' }]}>
                  <TextInput
                    value={storyReply}
                    onChangeText={setStoryReply}
                    placeholder="Send a message"
                    placeholderTextColor="#999"
                    style={[styles.input, { backgroundColor: 'transparent', borderColor: '#666', color: '#fff' }]}
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
              <Text>Close</Text>
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
                    <Text>Close</Text>
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
              <Text>Close</Text>
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
                <Text>Back to Explore</Text>
              </Pressable>
            </View>
          ) : null}
        </SafeAreaView>
      </Modal>

      {/* Story composer */}
      <Modal visible={composerOpen} animationType="slide">
        <SafeAreaView style={[styles.safe, { padding: 16 }]}>
          <Text style={styles.sectionTitle}>New story</Text>
          <Image
            source={{ uri: storyUri ?? `https://picsum.photos/seed/${storySeed}/540/960` }}
            style={{ width: '100%', height: 320, borderRadius: 12, backgroundColor: '#111' }}
            contentFit="cover"
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Pressable
              style={styles.secondary}
              onPress={async () => {
                const photo = await takePhoto();
                if (photo) {
                  setStoryUri(photo.uri);
                  setPhotoMsg('');
                } else {
                  setPhotoMsg('Camera permission is needed. Allow it in Settings › Permissions.');
                }
              }}>
              <Text>Take photo</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={async () => {
                const photo = await pickFromLibrary();
                if (photo) {
                  setStoryUri(photo.uri);
                  setPhotoMsg('');
                } else {
                  setPhotoMsg('Photo access is needed. Allow it in Settings › Permissions.');
                }
              }}>
              <Text>Choose from library</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={() => setCameraOpen('story')}>
              <Text>In-app camera</Text>
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
            <Pressable style={styles.miniFollow} onPress={() => setStoryUri(null)}>
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
              <Text>Cancel</Text>
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
              <Text>Close</Text>
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
              <Text>Close</Text>
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
                <Text>Close</Text>
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
                  <Text>Flip camera</Text>
                </Pressable>
                <Pressable
                  style={[styles.publish, !cameraReady && { opacity: 0.5 }]}
                  onPress={capture}
                  disabled={!cameraReady}>
                  <Text style={styles.publishTxt}>{cameraReady ? 'Capture' : 'Starting camera…'}</Text>
                </Pressable>
                <Pressable style={styles.secondary} onPress={() => setCameraOpen(null)}>
                  <Text>Close</Text>
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
                    setFollowList(null);
                    openProfile(u);
                  }}>
                  <Avatar uri={userByName(users, u).avatar} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.postUser}>{u}</Text>
                    <Text style={styles.muted}>{userByName(users, u).name}</Text>
                  </View>
                </Pressable>
                {u === ME ? (
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

      {/* Settings hub */}
      <Modal visible={settingsOpen} animationType="slide">
        <SafeAreaView style={[styles.safe, { paddingBottom: 16 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
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
            <Text style={[styles.sectionTitle, { marginLeft: 8 }]}>
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
            {settingsPage === null ? (
              <>
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
                    <Text>Send test notification</Text>
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
                    <Text>{confirmClear ? 'Tap again to erase everything' : 'Clear stored data'}</Text>
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
                  Instagram asks for access only when you use a feature. Status: {extraPerms.location === 'granted' && extraPerms.contacts === 'granted' && extraPerms.notifications === 'granted' && camPerm?.granted && libPerm?.granted && micPerm?.granted ? 'all granted' : 'some missing'}.
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
                  <Text>Open system settings</Text>
                </Pressable>
                <Text style={[styles.sectionTitle, { paddingHorizontal: 12, marginTop: 12 }]}>Phone contacts</Text>
                {contactsBusy ? (
                  <Text style={[styles.muted, { paddingHorizontal: 12 }]}>Loading contacts...</Text>
                ) : deviceContacts ? (
                  deviceContacts.length === 0 ? (
                    <View style={{ paddingHorizontal: 12 }}>
                      <Text style={styles.muted}>No contacts on this device.</Text>
                      <Pressable style={[styles.secondary, { alignSelf: 'flex-start' }]} onPress={importContacts}>
                        <Text>Try again</Text>
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
                <Text style={{ color: C.text }}>Instagram v1.1.0</Text>
                <Text style={styles.muted}>Your posts, messages and settings stay on this device.</Text>
                <Text style={[styles.muted, { marginTop: 8 }]}>Language: {settings.language}</Text>
              </View>
            )}
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.hairline,
    backgroundColor: C.bg,
  },
  logo: { fontFamily: 'GrandHotel_400Regular', fontSize: 32, color: C.text, flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.text, flex: 1, textAlign: 'center' },
  headerIcons: { flexDirection: 'row', gap: 20, alignItems: 'center' },
  storyStrip: { paddingHorizontal: 12, paddingVertical: 12 },
  storyItem: { alignItems: 'center', marginRight: 12, width: 72 },
  storyName: { fontSize: 11, color: C.text, marginTop: 4 },
  avatarRing: { padding: 2, borderColor: '#0095f6', backgroundColor: '#fff' },
  post: { marginBottom: 16 },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  postUser: { fontWeight: '600', color: C.text, flex: 1 },
  postImage: { width: '100%', aspectRatio: 1, backgroundColor: C.fill },
  postActions: { flexDirection: 'row', gap: 16, paddingHorizontal: 12, paddingVertical: 8 },
  likes: { fontWeight: '600', color: C.text, paddingHorizontal: 12 },
  caption: { color: C.text, paddingHorizontal: 12, marginTop: 2 },
  meta: { color: C.muted, paddingHorizontal: 12, marginTop: 2, fontSize: 12 },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.hairline,
    backgroundColor: C.bg,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: C.muted },
  sectionTitle: { fontWeight: '700', color: C.text, fontSize: 16, marginBottom: 8 },
  search: {
    backgroundColor: C.fill,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.text,
  },
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
  cell: { width: '33.33%', aspectRatio: 1, padding: 1 },
  cellImg: { flex: 1, backgroundColor: C.fill },
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
  profileTabs: { flexDirection: 'row', marginTop: 8 },
  profileBtn: {
    backgroundColor: C.fill,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  profileBtnTxt: { color: C.text, fontWeight: '600', fontSize: 14 },
  profileTab: { color: '#8e8e93', fontWeight: '600', paddingBottom: 6 },
  profileTabOn: { color: '#111', borderBottomWidth: 2, borderBottomColor: '#111' },
  seedRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  seed: { width: 52, height: 52, borderRadius: 8, backgroundColor: C.fill },
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
  secondaryTxt: { color: C.text },
  storyFull: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  storyUser: { color: '#fff', fontWeight: '700', marginTop: 10 },
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
  reel: { padding: 12, height: 520 },
  reelSide: { position: 'absolute', right: 20, bottom: 90, alignItems: 'center', gap: 14 },
  reelCount: { color: '#fff', textAlign: 'center', fontSize: 12 },
  reelCap: { color: '#fff', marginTop: 8 },
  switch: {
    width: 46,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.hairline,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  switchOn: { backgroundColor: '#0095f6' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  knobOn: { alignSelf: 'flex-end' },
  langChip: { borderWidth: 1, borderColor: C.hairline, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  langChipOn: { backgroundColor: '#0095f6', borderColor: '#0095f6' },
  noteCell: { width: 76, alignItems: 'center', marginRight: 10 },
  noteBubble: {
    backgroundColor: C.fill,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 4,
    maxWidth: 76,
    minHeight: 30,
    justifyContent: 'center',
  },
  noteText: { fontSize: 12, color: C.text, textAlign: 'center' },
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

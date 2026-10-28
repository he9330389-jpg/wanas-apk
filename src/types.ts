export type Language = 'ar' | 'en';

export type CoverKey = 'royal_majlis' | 'teal_horizon' | 'cairo_nights' | 'tech_oasis';

export type ReactionType =
  | 'like'
  | 'love'
  | 'haha'
  | 'support'
  | 'angry'
  | 'disagree';

export type PostAudience = 'public' | 'friends' | 'non_friends' | 'only_me';

export type StoryPrivacyMode =
  | 'public'
  | 'public_except_friends'
  | 'friends_of_friends'
  | 'friends_only'
  | 'custom_include'
  | 'custom_exclude';

export interface UserSettings {
  isPrivateAccount: boolean;
  whoCanComment: 'everyone' | 'followers' | 'nobody';
  whoCanMessage: 'everyone' | 'followers' | 'nobody';
  showOnlineStatus: boolean;
  allowVoiceComments: boolean;
  allowStoryReplies: boolean;
  twoFactorEnabled: boolean;
  notificationsLikes: boolean;
  notificationsComments: boolean;
  notificationsMessages: boolean;
  blockedHandles: string[];
  defaultPostAudience?: PostAudience;
  defaultStoryPrivacy?: StoryPrivacyMode;
}

export interface User {
  id: string;
  name: string;
  nameEn: string;
  handle: string;
  avatarKey: 'abdallah' | 'omar' | 'layla' | 'tariq' | 'noor';
  customAvatarUrl?: string;
  coverKey?: CoverKey;
  customCoverUrl?: string;
  email?: string;
  phone?: string;
  password?: string;
  role: string;
  roleEn: string;
  bio: string;
  bioEn: string;
  country?: string;
  city?: string;
  location?: string;
  interests?: string[];
  website?: string;
  isVerified?: boolean;
  followersCount: number;
  followingCount: number;
  friendIds?: string[];
  followingIds?: string[];
  isFollowing?: boolean;
  isOnline: boolean;
  lastActiveAtMs?: number;
  settings?: UserSettings;
}

export interface CommunityPage {
  id: string;
  titleAr: string;
  titleEn: string;
  handle: string;
  categoryAr: string;
  categoryEn: string;
  descriptionAr: string;
  descriptionEn: string;
  country?: string;
  interests: string[];
  followersIds: string[];
  followersCount: number;
  isFollowing?: boolean;
  isVerified?: boolean;
  coverKey?: CoverKey;
}

export interface CommentItem {
  id: string;
  authorId: string;
  content: string;
  audioUrl?: string;
  audioDuration?: string;
  createdAt: string;
  createdAtMs?: number;
  likes?: string[];
  reactions?: Partial<Record<ReactionType, string[]>>;
}

export type PostCategory = 'general' | 'majlis' | 'tech' | 'design' | 'video';

export interface Post {
  id: string;
  authorId: string;
  content: string;
  category: PostCategory;
  audience?: PostAudience;
  mediaKey?: 'majlis_coffee' | 'workspace_code' | 'cairo_sunset' | 'audio_waves';
  imageUrl?: string;
  videoUrl?: string;
  videoThumbnail?: string;
  videoDuration?: string;
  audioUrl?: string;
  audioDuration?: string;
  audioTitle?: string;
  linkUrl?: string;
  linkTitle?: string;
  isPinned?: boolean;
  isReported?: boolean;
  viewsCount?: number;
  sharesCount?: number;
  repostsCount?: number;
  repostedByUserIds?: string[];
  repostOfPostId?: string;
  repostedByAuthorId?: string;
  repostedByName?: string;
  reactions?: Partial<Record<ReactionType, string[]>>;
  poll?: {
    question: string;
    options: { id: string; label: string; votes: string[] }[];
  };
  createdAt: string;
  createdAtMs?: number;
  likes: string[]; // user IDs
  bookmarks: string[]; // user IDs
  comments: CommentItem[];
}

export type StoryType =
  | 'text'
  | 'image'
  | 'video'
  | 'voice'
  | 'audio_file'
  | 'link';

export interface StoryItem {
  id: string;
  authorId: string;
  storyType?: StoryType;
  title: string;
  titleEn: string;
  caption: string;
  captionEn: string;
  bgColor?: string;
  linkUrl?: string;
  mediaKey?: 'majlis_coffee' | 'workspace_code' | 'cairo_sunset' | 'audio_waves';
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  audioDuration?: string;
  privacyMode?: StoryPrivacyMode;
  allowedUserIds?: string[];
  excludedUserIds?: string[];
  createdAt: string;
  createdAtMs?: number;
  viewedBy: string[];
  likes?: string[];
  reactions?: Partial<Record<ReactionType, string[]>>;
}

export interface RoomParticipant {
  userId: string;
  isMuted: boolean;
  isSpeaking: boolean;
  role: 'host' | 'speaker' | 'listener';
  handRaised?: boolean;
}

export interface RoomMessage {
  id: string;
  senderId: string;
  text: string;
  audioUrl?: string;
  createdAt: string;
  createdAtMs?: number;
}

export interface MajlisRoom {
  id: string;
  title: string;
  titleEn: string;
  topic: string;
  topicEn: string;
  category: PostCategory;
  country?: string;
  interests?: string[];
  isLive: boolean;
  hostId: string;
  participants: RoomParticipant[];
  messages: RoomMessage[];
}

export interface DirectMessage {
  id: string;
  senderId: string;
  receiverId: string;
  text: string;
  audioUrl?: string;
  audioDuration?: string;
  sharedPostId?: string;
  createdAt: string;
  createdAtMs?: number;
}

export type NewsCategory = 'breaking' | 'tech' | 'community' | 'release';

export interface NewsItem {
  id: string;
  titleAr: string;
  titleEn: string;
  summaryAr: string;
  summaryEn: string;
  sourceAr: string;
  sourceEn: string;
  category: NewsCategory;
  publishedAtAr: string;
  publishedAtEn: string;
  createdAtMs?: number;
  url?: string;
  viewsCount: number;
  isBreaking?: boolean;
}

export interface NotificationItem {
  id: string;
  type: 'reaction' | 'comment' | 'repost' | 'share' | 'follow' | 'system';
  actorName: string;
  actorId: string;
  targetPostId?: string;
  textAr: string;
  textEn: string;
  createdAtMs: number;
  isRead: boolean;
}

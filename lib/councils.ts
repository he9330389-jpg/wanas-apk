import { supabase } from "@/lib/supabase";

export type CouncilRoom = {
  id: string;
  host_id: string;
  title: string;
  description: string;
  is_live: boolean;
  visibility: "public" | "followers" | "private";
  audio_provider: string | null;
  audio_channel: string | null;
  is_recorded: boolean;
  scheduled_at: string | null;
  speaker_slots: number;
  created_at: string;
  ended_at: string | null;
};

export type CouncilMember = {
  room_id: string;
  user_id: string;
  role: "host" | "speaker" | "listener" | "moderator";
  joined_at: string;
  left_at: string | null;
};

/** Lists councils the user can see, newest live ones first. */
export async function listCouncils(): Promise<CouncilRoom[]> {
  const { data, error } = await supabase
    .from("majlis_rooms")
    .select("*")
    .is("ended_at", null)
    .order("is_live", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return (data ?? []) as CouncilRoom[];
}

/** Creates a council; only the host can later start the audio channel. */
export async function createCouncil(input: {
  hostId: string;
  title: string;
  description?: string;
  visibility?: CouncilRoom["visibility"];
  scheduledAt?: string | null;
  isRecorded?: boolean;
}): Promise<CouncilRoom> {
  const { data, error } = await supabase
    .from("majlis_rooms")
    .insert({
      host_id: input.hostId,
      title: input.title.trim(),
      description: input.description?.trim() ?? "",
      visibility: input.visibility ?? "public",
      scheduled_at: input.scheduledAt ?? null,
      is_recorded: input.isRecorded ?? false,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  const room = data as CouncilRoom;
  await supabase.from("majlis_members").insert({
    room_id: room.id,
    user_id: input.hostId,
    role: "host",
  });
  return room;
}

/** Joins a public council as a listener. */
export async function joinCouncil(roomId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("majlis_members")
    .upsert({ room_id: roomId, user_id: userId, role: "listener", left_at: null }, {
      onConflict: "room_id,user_id",
    });
  if (error) throw new Error(error.message);
}

export async function leaveCouncil(roomId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("majlis_members")
    .update({ left_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Listener asks the host for the microphone. */
export async function raiseHand(roomId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("majlis_speaking_requests")
    .upsert({ room_id: roomId, user_id: userId, status: "pending", responded_at: null }, {
      onConflict: "room_id,user_id",
    });
  if (error) throw new Error(error.message);
}

/** Host approves or declines a raised hand. */
export async function respondToHand(
  roomId: string,
  userId: string,
  approve: boolean
): Promise<void> {
  const status = approve ? "approved" : "declined";
  const { error } = await supabase
    .from("majlis_speaking_requests")
    .update({ status, responded_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  if (approve) {
    const { error: memberError } = await supabase
      .from("majlis_members")
      .update({ role: "speaker" })
      .eq("room_id", roomId)
      .eq("user_id", userId);
    if (memberError) throw new Error(memberError.message);
  }
}

/**
 * Starts the live audio session for a council the user hosts.
 * `audioChannel` must come from the real audio provider (e.g. a LiveKit room
 * name); it is never generated client-side for other people's rooms.
 */
export async function startCouncilAudio(
  roomId: string,
  hostId: string,
  audioChannel: string,
  provider: string
): Promise<void> {
  const { error } = await supabase
    .from("majlis_rooms")
    .update({ is_live: true, audio_channel: audioChannel, audio_provider: provider })
    .eq("id", roomId)
    .eq("host_id", hostId);
  if (error) throw new Error(error.message);
}

export async function endCouncilAudio(roomId: string, hostId: string): Promise<void> {
  const { error } = await supabase
    .from("majlis_rooms")
    .update({ is_live: false, ended_at: new Date().toISOString(), audio_channel: null })
    .eq("id", roomId)
    .eq("host_id", hostId);
  if (error) throw new Error(error.message);
}

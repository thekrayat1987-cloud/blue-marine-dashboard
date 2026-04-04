"use client";

import {
  Video,
  Image as ImageIcon,
  MessageSquare,
  Flame,
  Calendar,
  AtSign,
  Clock,
  Hash,
} from "lucide-react";
import { contentCalendar, reelsIdeas } from "@/data/dashboardData";

const dayLabels: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const typeIcons: Record<string, typeof Video> = {
  Reel: Video,
  Story: MessageSquare,
  Carousel: ImageIcon,
  "Story + Post": ImageIcon,
};

const publicationPlan = [
  {
    day: "Monday",
    posts: [
      { time: "12:00", type: "Reel", topic: "Behind the scenes / Crafting", caption: "Sewing process or fabric sourcing", hashtags: "#BlueMarine #MadeInKuwait #Dishdasha #HandMade #KuwaitFashion" },
    ],
  },
  {
    day: "Tuesday",
    posts: [
      { time: "18:00", type: "Story", topic: "Product of the day + Poll", caption: "Which color do you prefer? Interactive poll", hashtags: "#OOTD #KuwaitStyle #TraditionalWear" },
      { time: "20:00", type: "Story", topic: "Q&A / Questions box", caption: "Ask us anything about our collections", hashtags: "#AskBlueMarine #Kuwait" },
    ],
  },
  {
    day: "Wednesday",
    posts: [
      { time: "12:00", type: "Reel", topic: "Style / OOTD / Lookbook", caption: "3 ways to wear the abaya or GRWM event", hashtags: "#AbayaStyle #ModestFashion #KuwaitFashion #GRWM #Lookbook" },
    ],
  },
  {
    day: "Thursday",
    posts: [
      { time: "17:00", type: "Carousel", topic: "Educational / Guide / Tips", caption: "How to spot quality fabric / Care guide", hashtags: "#FashionTips #QualityFabric #BlueMarine #KuwaitLife" },
    ],
  },
  {
    day: "Friday",
    posts: [
      { time: "10:00", type: "Story", topic: "Jumu'ah Vibes", caption: "Friday outfit + inspiring message", hashtags: "#JumuahMubarak #FridayVibes #Kuwait" },
      { time: "19:00", type: "Story", topic: "Weekend Promo", caption: "Weekend special offer / New product", hashtags: "#WeekendSale #BlueMarine #ShopNow" },
    ],
  },
  {
    day: "Saturday",
    posts: [
      { time: "13:00", type: "Reel", topic: "UGC / Customer testimonial", caption: "Customer unboxing reaction or before/after alterations", hashtags: "#CustomerReview #Unboxing #BlueMarine #KuwaitShopping" },
    ],
  },
  {
    day: "Sunday",
    posts: [
      { time: "18:00", type: "Post", topic: "Weekly recap", caption: "New arrivals + best-sellers + next week preview", hashtags: "#WeeklyRecap #NewArrivals #BlueMarine #KuwaitFashion" },
      { time: "20:00", type: "Story", topic: "Next week teaser", caption: "Preview of upcoming content", hashtags: "#ComingSoon #StayTuned" },
    ],
  },
];

export default function ContentPage() {
  return (
    <div className="flex-1 overflow-auto">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-background/80 backdrop-blur-md px-8 py-5">
        <h1 className="text-xl font-bold text-white">Content & Publications</h1>
        <p className="text-sm text-slate-400 mt-0.5">Content calendar + Instagram publication plan</p>
      </header>

      <div className="p-8 space-y-8">
        {/* Weekly Calendar */}
        <div>
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-accent" />
            Weekly Calendar
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {Object.entries(contentCalendar).map(([day, data]) => {
              const Icon = typeIcons[data.type] || Video;
              return (
                <div key={day} className="rounded-xl bg-card border border-white/5 p-4">
                  <p className="text-xs font-semibold text-accent mb-2">{dayLabels[day]}</p>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Icon className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-medium text-white">{data.type}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{data.theme}</p>
                  <p className="text-[10px] text-slate-600 mt-2">{data.platform}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Instagram Publication Plan */}
        <div>
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <AtSign className="w-4 h-4 text-instagram" />
            Instagram Publication Plan
          </h2>
          <p className="text-xs text-slate-400 mb-4">Optimized times for Kuwait (GMT+3) — Best engagement moments</p>
          <div className="space-y-4">
            {publicationPlan.map((day) => (
              <div key={day.day} className="rounded-xl bg-card border border-white/5 overflow-hidden">
                <div className="px-5 py-3 border-b border-white/5 bg-white/[.02]">
                  <span className="text-sm font-semibold text-accent">{day.day}</span>
                </div>
                <div className="divide-y divide-white/5">
                  {day.posts.map((post, i) => (
                    <div key={i} className="px-5 py-4 flex flex-col md:flex-row md:items-start gap-4">
                      <div className="flex items-center gap-2 shrink-0 w-24">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-sm font-mono font-medium text-white">{post.time}</span>
                      </div>
                      <div className="shrink-0">
                        <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${
                          post.type === "Reel" ? "bg-pink-500/20 text-pink-400" :
                          post.type === "Story" ? "bg-purple-500/20 text-purple-400" :
                          post.type === "Carousel" ? "bg-blue-500/20 text-blue-400" :
                          "bg-green-500/20 text-green-400"
                        }`}>
                          {post.type}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">{post.topic}</p>
                        <p className="text-xs text-slate-400 mt-1">{post.caption}</p>
                        <div className="flex items-center gap-1 mt-2">
                          <Hash className="w-3 h-3 text-slate-600" />
                          <p className="text-[10px] text-slate-500 truncate">{post.hashtags}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reels Ideas */}
        <div>
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Video className="w-4 h-4 text-pink-400" />
            Reels Ideas
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {reelsIdeas.map((category) => (
              <div key={category.category} className="rounded-xl bg-card border border-white/5 overflow-hidden">
                <div className="px-5 py-3 border-b border-white/5" style={{ borderLeftWidth: 3, borderLeftColor: category.color }}>
                  <span className="text-sm font-semibold text-white">{category.category}</span>
                </div>
                <div className="divide-y divide-white/5">
                  {category.ideas.map((idea) => (
                    <div key={idea.title} className="px-5 py-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-white">{idea.title}</span>
                        {idea.trending && (
                          <span className="flex items-center gap-0.5 text-[10px] font-semibold text-orange-400 bg-orange-500/15 px-1.5 py-0.5 rounded-full">
                            <Flame className="w-2.5 h-2.5" />
                            Trending
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{idea.description}</p>
                      <p className="text-[11px] text-accent mt-2 italic">&ldquo;{idea.hook}&rdquo;</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

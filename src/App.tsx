import React, { useState, useEffect, useMemo, Dispatch, SetStateAction, CSSProperties } from 'react';
import { Search, ChevronLeft, ChevronRight, Calendar, Tv, Film, Plus, ChevronDown, Play, Loader2, AlertCircle } from 'lucide-react';

// Constants
const API_ENDPOINT: string = 'http://tgv2env-env-test.eba-9wibqvvm.eu-west-2.elasticbeanstalk.com/allEpg';
const API_KEY: string = 'ae114294-f66b-4d1c-aa75-89c52ef60692';

// --- Type Definitions ---

// Processed data types used within the components
interface Channel {
  channelId: string;
  channelName: string;
  logoUrl: string | null;
}

interface Program {
  programId: string;
  title: string | null; // Title can sometimes be null
  startTime: string; // ISO String format
  endTime: string;   // ISO String format
  channelId: string;
  description: string | null;
}

// Types matching the structure of the API response
interface ApiChannelImage {
  id: string;
  url: string | null;
  // Add other fields if needed (height, width, kind, etc.)
}

interface ApiChannel {
  id: string;
  title: string | null;
  description: string | null;
  images?: ApiChannelImage[]; // Optional array of images
  // Add other channel fields if needed (url, channelid, country, etc.)
}

interface ApiProgramImage {
  id: string;
  url: string | null;
  // Add other fields if needed
}

interface ApiProgram {
  id: string;
  title: string | null;
  description: string | null;
  channel: ApiChannel | null; // Channel can potentially be null
  scheduleStart: string;
  scheduleEnd: string;
  images?: ApiProgramImage[]; // Optional array of images
  // Add other program fields if needed (show, seasonNumber, etc.)
}

interface ApiItem {
  programs: ApiProgram[];
}

// Type for the entire API response (root is an array)
type ApiResponse = ApiItem[];


// --- Helper Functions ---

// Get dates for the week starting from today
const getWeekDates = (): Date[] => {
  const dates: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize to start of the day
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    dates.push(date);
  }
  return dates;
};

// Format date for display
const formatDate = (date: Date): string => {
  const options: Intl.DateTimeFormatOptions = { weekday: 'short' };
  return date.toLocaleDateString(undefined, options); // e.g., "Tue"
};

// Check if two dates are the same day
const isSameDay = (date1: Date | null, date2: Date | null): boolean => {
  if (!date1 || !date2) return false;
  return date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate();
};

// Parse ISO string and get hours (UTC)
const getUTCHoursFromISO = (isoString: string | null): number => {
  if (!isoString) return 0;
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) { // Check for invalid date
      console.error("Invalid date string:", isoString);
      return 0;
    }
    return date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  } catch (e) {
    console.error("Error parsing date:", isoString, e);
    return 0;
  }
};

// Calculate duration in hours between two ISO strings
const getDurationHours = (startISO: string | null, endISO: string | null): number => {
  if (!startISO || !endISO) return 0;
  try {
    const startDate = new Date(startISO);
    const endDate = new Date(endISO);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) { // Check for invalid dates
      console.error("Invalid date strings for duration:", startISO, endISO);
      return 0;
    }
    const duration = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
    return duration > 0 ? duration : 0; // Ensure duration is not negative
  } catch (e) {
    console.error("Error calculating duration:", startISO, endISO, e);
    return 0;
  }
};

// Format time from fractional UTC hour
const formatTimeFromUTCHour = (hour: number): string => {
  const totalMinutes = Math.round(hour * 60);
  const h = Math.floor(totalMinutes / 60) % 24; // Handle hours wrapping past 24
  const m = totalMinutes % 60;
  const H = h < 10 ? '0' + h : h;
  const M = m < 10 ? '0' + m : m;
  return `${H}:${M}`;
};


// --- Components ---

// TV Guide Controls Component (Remains static for now)
const GuideControls: React.FC = () => (
  <div className="px-6 py-3 flex items-center justify-between border-b border-gray-200 bg-white sticky top-0 z-20">
    {/* Left Controls */}
    <div className="flex items-center space-x-4">
      <button className="p-1 text-gray-600 hover:text-gray-900"><Tv className="w-5 h-5" /></button>
      <button className="p-1 text-gray-600 hover:text-gray-900"><Calendar className="w-5 h-5" /></button>
      <span className="text-gray-300">|</span>
      <button className="p-1 text-gray-600 hover:text-gray-900">&lt;/&gt;</button>
    </div>

    {/* Middle Controls */}
    <div className="flex items-center space-x-1">
      <button className="text-sm font-semibold px-3 py-1 rounded-full bg-gray-200 text-gray-800">Movies</button>
      <button className="text-sm font-semibold px-3 py-1 rounded-full hover:bg-gray-100 text-gray-600">Sport</button>
    </div>

    {/* Right Controls */}
    <div className="flex items-center space-x-4">
      <span className="text-gray-600 font-bold">---</span>
      <button className="p-1 text-gray-600 hover:text-gray-900"><Plus className="w-5 h-5" /></button>
      <button className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-900">
        <span>Regions</span>
        <ChevronDown className="w-4 h-4" />
      </button>
    </div>
  </div>
);

// Props for DateNav
interface DateNavProps {
  selectedDate: Date;
  setSelectedDate: Dispatch<SetStateAction<Date>>;
}

// Date Navigation Component
const DateNav: React.FC<DateNavProps> = ({ selectedDate, setSelectedDate }) => {
  const weekDates = useMemo<Date[]>(() => getWeekDates(), []); // Calculate week dates once
  const today = useMemo<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0); // Normalize today
    return d;
  }, []);

  const handleDateChange = (increment: number): void => {
    setSelectedDate(currentDate => {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + increment);
      return newDate;
    });
    // NOTE: In a real app, changing the date range might trigger a new API call
    // if the current data doesn't cover the new date.
    // The current implementation only filters the initially loaded data.
  };


  return (
    <div className="px-6 py-3 flex items-center justify-between border-b border-gray-200 bg-white sticky top-[57px] z-20"> {/* Adjust top based on GuideControls height */}
      {/* Previous Button */}
      <button onClick={() => handleDateChange(-1)} className="p-1 text-gray-500 hover:text-gray-800 mr-2">
        <ChevronLeft className="w-5 h-5" />
      </button>

      {/* Date Items */}
      <div className="flex-grow flex justify-center items-center space-x-3 overflow-x-auto">
        {weekDates.map((d, index) => {
          const isSelected = isSameDay(d, selectedDate);
          const isToday = isSameDay(d, today);
          const dayLabel = isToday ? 'Today' : formatDate(d);

          return (
            <div
              key={index}
              onClick={() => setSelectedDate(d)}
              className={`text-center px-2 py-1 rounded cursor-pointer whitespace-nowrap ${isSelected ? 'bg-red-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                } ${isToday && !isSelected ? 'font-bold' : ''}`} // Bold Today if not selected
            >
              <div className="text-xs font-medium">{dayLabel}</div>
              <div className="text-lg font-semibold">{d.getDate()}</div>
            </div>
          );
        })}
      </div>

      {/* Next Button */}
      <button onClick={() => handleDateChange(1)} className="p-1 text-gray-500 hover:text-gray-800 ml-2">
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
};

// Props for TimeGrid
interface TimeGridProps {
  channels: Channel[];
  programs: Program[];
  selectedDate: Date;
}

// Time Grid Component
const TimeGrid: React.FC<TimeGridProps> = ({ channels, programs, selectedDate }) => {
  // Define the time range (24 hours) and scale
  const startTime: number = 0; // 00:00 UTC
  const endTime: number = 24; // 24:00 UTC
  const pixelsPerHour: number = 80; // Width of each hour column

  // Generate time labels for the 24-hour grid
  const timeLabels = useMemo<string[]>(() => {
    const labels: string[] = [];
    for (let i = startTime; i < endTime; i++) {
      labels.push(`${i}:00`); // Display hour mark
    }
    return labels;
  }, [startTime, endTime]);

  // Calculate the position and width of a program block based on UTC times
  const getProgramStyle = (startISO: string | null, endISO: string | null): CSSProperties => {
    const startHour = getUTCHoursFromISO(startISO);
    const duration = getDurationHours(startISO, endISO);

    if (duration <= 0) return { display: 'none' }; // Hide programs with no duration

    const left = (startHour - startTime) * pixelsPerHour;
    const width = duration * pixelsPerHour;

    return {
      left: `${left}px`,
      width: `${width}px`,
      position: 'absolute',
      top: '0.25rem', // Equivalent to top-1
      bottom: '0.25rem', // Equivalent to bottom-1
    };
  };

  // Filter programs for the selected date
  const filteredPrograms = useMemo<Program[]>(() => {
    if (!selectedDate) return [];
    return programs.filter(p => {
      try {
        // Ensure startTime exists before creating a Date object
        if (!p.startTime) return false;
        const programStartDate = new Date(p.startTime);
        if (isNaN(programStartDate.getTime())) return false; // Check if date is valid
        return isSameDay(programStartDate, selectedDate);
      } catch (e) {
        console.error("Error filtering program date:", p.startTime, e);
        return false;
      }
    });
  }, [programs, selectedDate]);

  // Get current time position marker (relative to UTC start time 0)
  const getCurrentTimePosition = (): number => {
    const now = new Date(); // Current local time
    const currentUTCHour = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    return (currentUTCHour - startTime) * pixelsPerHour;
  };

  const currentTimeLinePosition = getCurrentTimePosition();
  const showCurrentTimeLine = isSameDay(selectedDate, new Date()); // Show line only for today


  return (
    <div className="flex border-t border-gray-200 overflow-x-auto relative pb-10 bg-white">
      {/* Channel List (Fixed Width, Sticky) */}
      <div className="w-32 flex-shrink-0 border-r border-gray-200 bg-gray-50 sticky left-0 z-10">
        {/* Header Spacer */}
        <div className="h-10 border-b border-gray-200 flex items-center justify-center text-xs font-semibold text-gray-500">
          Channels
        </div>
        {/* Channel Items */}
        {channels.map(channel => (
          <div key={channel.channelId} className="h-20 border-b border-gray-200 flex flex-col items-center justify-center text-center px-2">
            {/* Display Channel Name */}
            <div className="text-xs font-medium">{channel.channelName || `Channel ${channel.channelId}`}</div>
            {/* Optional: Display Logo if available */}
            {channel.logoUrl && <img src={channel.logoUrl} alt={channel.channelName} className="w-10 h-10 mt-1 object-contain" />}
          </div>
        ))}
      </div>

      {/* Timeline and Program Grid (Scrollable) */}
      <div className="flex-grow relative" style={{ width: `${(endTime - startTime) * pixelsPerHour}px` }}> {/* Set explicit width for scrolling */}
        {/* Time Header */}
        <div className="h-10 flex border-b border-gray-200 sticky top-0 bg-white z-10"> {/* This header scrolls with the page, not fixed */}
          {timeLabels.map((label, index) => (
            <div
              key={index}
              className="flex-shrink-0 border-r border-gray-200 text-center text-xs font-semibold text-gray-500 flex items-center justify-center"
              style={{ width: `${pixelsPerHour}px` }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Program Rows */}
        {channels.map(channel => (
          <div key={channel.channelId} className="h-20 border-b border-gray-200 relative">
            {/* Vertical Grid Lines */}
            {timeLabels.map((_, index) => (
              <div
                key={index}
                className="absolute top-0 bottom-0 border-r border-gray-100"
                style={{ left: `${index * pixelsPerHour}px`, width: `${pixelsPerHour}px`, height: '100%' }}
              ></div>
            ))}

            {/* Programs for this channel and selected date */}
            {filteredPrograms
              .filter(p => p.channelId === channel.channelId)
              .map((program) => (
                <div
                  key={program.programId} // Use programId as key
                  className={`absolute bg-blue-100 rounded-md px-2 py-1 text-xs shadow-sm flex items-start overflow-hidden border border-gray-300`} // Example color
                  style={getProgramStyle(program.startTime, program.endTime)} // Pass original startTime/endTime
                  title={`${program.title || ''} (${formatTimeFromUTCHour(getUTCHoursFromISO(program.startTime))} - ${formatTimeFromUTCHour(getUTCHoursFromISO(program.endTime))} UTC)`} // Tooltip
                >
                  <div className="flex-grow overflow-hidden">
                    <p className="font-semibold text-gray-800 whitespace-nowrap overflow-ellipsis">{program.title || "Untitled Program"}</p>
                    <p className="text-gray-600 whitespace-nowrap">{formatTimeFromUTCHour(getUTCHoursFromISO(program.startTime))} UTC</p>
                  </div>
                  {/* Add play icon if needed based on program data */}
                </div>
              ))}
          </div>
        ))}

        {/* Current Time Line */}
        {showCurrentTimeLine && (
          <div
            className="absolute w-0.5 bg-red-500 z-20 pointer-events-none"
            style={{
              left: `${currentTimeLinePosition}px`,
              top: '40px', // Start below the time header
              height: `calc(100% - 40px)` // Extend to bottom of grid area
            }}
          >
            {/* Optional: Add a small circle/indicator at the top */}
            <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-red-500 rounded-full"></div>
          </div>
        )}
      </div>
    </div>
  );
};


// Main App Component
const App: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day UTC
    return today;
  }); // Default to today

  useEffect(() => {
    const fetchEpgData = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      console.log("Fetching EPG data...");
      try {
        const response = await fetch(API_ENDPOINT, {
          headers: {
            'x-api-key': API_KEY,
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Explicitly type the result from response.json()
        const result = await response.json() as ApiResponse;
        console.log("API Response:", result); // Log the raw response

        // --- Data Processing for the NEW API structure ---
        if (Array.isArray(result)) {
          // Use Map<string, Channel> for type safety
          const processedChannelsMap = new Map<string, Channel>();
          const processedPrograms: Program[] = [];

          result.forEach((item: ApiItem) => {
            // Check if item and item.programs exist and are an array
            if (item && Array.isArray(item.programs)) {
              item.programs.forEach((program: ApiProgram) => {
                // Ensure program and nested channel object exist and have required IDs
                if (program && program.channel && program.channel.id && program.id && program.scheduleStart && program.scheduleEnd) {
                  const channelId: string = program.channel.id;
                  const channelName: string = program.channel.title || `Channel ${channelId}`; // Use title or fallback

                  // Add/update channel in the map
                  if (!processedChannelsMap.has(channelId)) {
                    processedChannelsMap.set(channelId, {
                      channelId: channelId,
                      channelName: channelName,
                      // Extract logo URL if available (assuming first image is logo)
                      logoUrl: program.channel.images?.[0]?.url || null
                    });
                  }

                  // Transform program data to match TimeGrid expectations
                  processedPrograms.push({
                    programId: program.id, // Use program's own id
                    title: program.title,
                    startTime: program.scheduleStart, // Use scheduleStart
                    endTime: program.scheduleEnd,     // Use scheduleEnd
                    channelId: channelId, // Link program to channel
                    description: program.description, // Keep description if needed later
                  });
                } else {
                  console.warn("Skipping program due to missing or incomplete data:", program);
                }
              });
            }
          });

          const uniqueChannels: Channel[] = Array.from(processedChannelsMap.values());
          console.log("Processed Channels:", uniqueChannels);
          console.log("Processed Programs:", processedPrograms);

          setChannels(uniqueChannels);
          setPrograms(processedPrograms);

        } else {
          console.error("API response is not an array:", result);
          throw new Error('Invalid API response format: Expected an array.');
        }
      } catch (err: unknown) { // Catch unknown type for better error handling
        console.error("Failed to fetch or process EPG data:", err);
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("An unknown error occurred");
        }
      } finally {
        setLoading(false);
        console.log("Fetching finished.");
      }
    };

    fetchEpgData();
  }, []); // Fetch data only on initial mount

  return (
    <div className="bg-gray-100 min-h-screen font-sans flex flex-col">
      {/* Sticky Controls and DateNav */}
      <div className="sticky top-0 z-30">
        <GuideControls />
        <DateNav selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
      </div>

      {/* Main Content Area */}
      <main className="flex-grow max-w-full mx-auto bg-white shadow-lg w-full overflow-hidden"> {/* Added overflow-hidden */}
        {loading && (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <Loader2 className="animate-spin w-8 h-8 mr-2" />
            Loading EPG data...
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center h-64 text-red-600 bg-red-50 p-4 rounded-md m-4">
            <AlertCircle className="w-8 h-8 mb-2" />
            <p className="font-semibold">Error loading data:</p>
            <p className="text-sm text-center">{error}</p>
          </div>
        )}
        {!loading && !error && channels.length > 0 && (
          <TimeGrid channels={channels} programs={programs} selectedDate={selectedDate} />
        )}
        {!loading && !error && channels.length === 0 && (
          <div className="flex items-center justify-center h-64 text-gray-500">
            No EPG data available. Check API or selected date.
          </div>
        )}
      </main>

      {/* Console placeholder */}
      <div className="bg-gray-800 text-gray-400 text-xs p-2 mt-auto"> {/* Use mt-auto to push to bottom */}
        Console
      </div>
    </div>
  );
}

// Export the App component as default
export default App;


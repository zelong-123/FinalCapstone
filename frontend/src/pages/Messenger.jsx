import React, { useEffect, useRef, useState } from 'react';
import {
  FaArrowLeft,
  FaBoxesStacked,
  FaBuilding,
  FaBullhorn,
  FaCheckDouble,
  FaCircle,
  FaCommentDots,
  FaComments,
  FaHandshake,
  FaMagnifyingGlass,
  FaPaperPlane,
  FaStore,
  FaUser,
  FaUsers,
  FaUserShield,
} from 'react-icons/fa6';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import {
  formatDateGroup,
  formatMessageTime,
  getDeptMeta,
  getInitials,
} from '../components/Messenger/MessengerWidget';
import '../components/Messenger/messenger.css';

const QUICK_REACTIONS = ['👍', '❤️', '👏', '🎉', '🚀', '📦', '💡', '🔥'];

export default function Messenger() {
  const { user } = useAuth();
  const {
    channels,
    activeChannel,
    messages,
    sendingMessage,
    directory,
    selectChannel,
    sendMessage,
    startDirectChat,
    onlineCount,
  } = useChat();

  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('chats'); // 'chats' | 'directory'
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when active channel changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeChannel?.id]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!inputText.trim() || sendingMessage) return;
    const text = inputText;
    setInputText('');
    try {
      await sendMessage(text);
    } catch {
      setInputText(text);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleAddReaction = (emoji) => {
    setInputText((prev) => (prev ? `${prev} ${emoji}` : emoji));
    inputRef.current?.focus();
  };

  const filteredChannels = channels.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.department && c.department.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredDirectory = directory.filter((u) =>
    u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.department && u.department.toLowerCase().includes(searchQuery.toLowerCase())) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeMeta = activeChannel
    ? getDeptMeta(activeChannel.department, activeChannel.type)
    : null;
  const ActiveIcon = activeMeta ? activeMeta.icon : FaComments;

  return (
    <div className="operations-page-wrap">
      {/* Page Header */}
      <div className="page-header-row" style={{ marginBottom: '16px' }}>
        <div>
          <h1 className="page-main-heading">
            Department Messenger
          </h1>
          <p className="page-sub-heading">
            Real-time live messaging between Administration, Marketing, Sales, Logistics, and Branch Franchisees.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="messenger-status-pill" style={{ background: 'var(--surface-strong)', padding: '6px 14px', borderRadius: '20px' }}>
            <span className="pulse-dot" />
            <span>Real-time Live • {onlineCount} active now</span>
          </div>
        </div>
      </div>

      {/* Main Full Messenger Container */}
      <div className="full-messenger-page">
        {/* Left Column: Channels & Directory */}
        <aside className="full-messenger-sidebar">
          {/* Header tabs */}
          <div className="messenger-tabs" style={{ padding: '12px 14px' }}>
            <button
              type="button"
              className={`messenger-tab${activeTab === 'chats' ? ' active' : ''}`}
              onClick={() => setActiveTab('chats')}
            >
              <FaComments /> Channels
            </button>
            <button
              type="button"
              className={`messenger-tab${activeTab === 'directory' ? ' active' : ''}`}
              onClick={() => setActiveTab('directory')}
            >
              <FaUsers /> Team ({directory.length})
            </button>
          </div>

          {/* Search bar */}
          <div className="messenger-search-box">
            <input
              type="text"
              className="messenger-search-input"
              placeholder={activeTab === 'chats' ? 'Search channels…' : 'Search colleagues…'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* List area */}
          <div className="messenger-list-view">
            {activeTab === 'chats' ? (
              <>
                <div className="channel-section-title">Department Rooms</div>
                {filteredChannels
                  .filter((c) => c.type === 'department')
                  .map((chan) => {
                    const meta = getDeptMeta(chan.department, 'department');
                    const Icon = meta.icon;
                    const isSelected = chan.id === activeChannel?.id;
                    const hasUnread = (chan.unread_count || 0) > 0;

                    return (
                      <button
                        key={chan.id}
                        type="button"
                        className={`channel-list-item${isSelected ? ' active' : ''}`}
                        onClick={() => selectChannel(chan.id)}
                      >
                        <div className={`channel-icon-wrap ${meta.className}`}>
                          <Icon />
                        </div>
                        <div className="channel-meta">
                          <div className="channel-row-top">
                            <span className="channel-row-name">{chan.name}</span>
                            {chan.last_message && (
                              <span className="channel-row-time">
                                {formatMessageTime(chan.last_message.created_at)}
                              </span>
                            )}
                          </div>
                          <div className="channel-row-preview">
                            {chan.last_message
                              ? `${chan.last_message.user?.full_name?.split(' ')[0] || 'User'}: ${chan.last_message.message}`
                              : chan.description || 'Live room'}
                          </div>
                        </div>
                        {hasUnread && (
                          <span className="channel-unread-pill">{chan.unread_count}</span>
                        )}
                      </button>
                    );
                  })}

                {filteredChannels.some((c) => c.type === 'direct') && (
                  <>
                    <div className="channel-section-title" style={{ marginTop: '16px' }}>
                      Direct Messages
                    </div>
                    {filteredChannels
                      .filter((c) => c.type === 'direct')
                      .map((chan) => {
                        const isSelected = chan.id === activeChannel?.id;
                        return (
                          <button
                            key={chan.id}
                            type="button"
                            className={`channel-list-item${isSelected ? ' active' : ''}`}
                            onClick={() => selectChannel(chan.id)}
                          >
                            <div className={`messenger-avatar ${chan.is_online ? 'online' : ''}`}>
                              {getInitials(chan.name)}
                            </div>
                            <div className="channel-meta">
                              <div className="channel-row-top">
                                <span className="channel-row-name">{chan.name}</span>
                                {chan.last_message && (
                                  <span className="channel-row-time">
                                    {formatMessageTime(chan.last_message.created_at)}
                                  </span>
                                )}
                              </div>
                              <div className="channel-row-preview">
                                {chan.last_message ? chan.last_message.message : 'Direct conversation'}
                              </div>
                            </div>
                            {chan.unread_count > 0 && (
                              <span className="channel-unread-pill">{chan.unread_count}</span>
                            )}
                          </button>
                        );
                      })}
                  </>
                )}
              </>
            ) : (
              /* Directory View */
              <div>
                <div className="channel-section-title">Franchise Titan Directory</div>
                {filteredDirectory.map((colleague) => (
                  <div key={colleague.id} className="user-dir-item">
                    <div className="user-dir-info">
                      <div className={`messenger-avatar ${colleague.is_online ? 'online' : ''}`}>
                        {getInitials(colleague.full_name)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="user-dir-name">{colleague.full_name}</div>
                        <div className="user-dir-role">
                          {colleague.role_label || colleague.department}
                          {colleague.is_online && (
                            <span style={{ color: '#22c55e', marginLeft: '6px' }}>• Active</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="chat-btn-action"
                      onClick={() => startDirectChat(colleague.id)}
                    >
                      Message
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Center Column: Active Chat Thread */}
        <section className="full-messenger-main">
          {/* Thread Header */}
          <div className="messenger-header" style={{ padding: '14px 20px' }}>
            <div className="messenger-header-left">
              <div className={`channel-icon-wrap ${activeMeta?.className || 'dept-general'}`} style={{ width: '36px', height: '36px' }}>
                <ActiveIcon />
              </div>
              <div className="messenger-title-wrap">
                <div className="messenger-title" style={{ fontSize: '15px' }}>
                  {activeChannel?.name || 'Live Room'}
                </div>
                <div className="messenger-status-pill">
                  <span className="pulse-dot" />
                  <span>
                    {activeChannel?.type === 'direct'
                      ? (activeChannel?.is_online ? 'Active now' : 'Colleague')
                      : (activeChannel?.description || 'Real-time department channel')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div className="messenger-messages-container" style={{ padding: '18px 24px' }}>
            {messages.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--muted)', margin: 'auto', padding: '32px' }}>
                <FaComments style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.5 }} />
                <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '16px' }}>Welcome to {activeChannel?.name}</h3>
                <p style={{ margin: '6px 0 0', fontSize: '13px' }}>
                  Messages sent here are delivered instantly in real time to all department members.
                </p>
              </div>
            ) : (
              messages.map((msg, index) => {
                const isMe = msg.user_id === user?.id;
                const prevMsg = messages[index - 1];
                const showDate =
                  !prevMsg ||
                  new Date(msg.created_at).toDateString() !==
                    new Date(prevMsg.created_at).toDateString();

                return (
                  <React.Fragment key={msg.id || index}>
                    {showDate && (
                      <div className="date-divider">
                        <span>{formatDateGroup(msg.created_at)}</span>
                      </div>
                    )}
                    <div className={`message-bubble-row ${isMe ? 'sent-me' : 'sent-them'}`} style={{ maxWidth: '75%' }}>
                      {!isMe && (
                        <div className="bubble-avatar">
                          {getInitials(msg.user?.full_name)}
                        </div>
                      )}
                      <div className="bubble-content">
                        {!isMe && (
                          <div className="bubble-sender-name">
                            <span>{msg.user?.full_name || 'Team Member'}</span>
                            {msg.user?.role?.label && (
                              <span className="bubble-role-pill">
                                {msg.user.role.label}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="bubble-box" style={{ fontSize: '14px', padding: '10px 16px' }}>
                          {msg.message}
                          <div className="bubble-footer">
                            <span>{formatMessageTime(msg.created_at)}</span>
                            {isMe && (
                              msg._optimistic ? (
                                <span style={{ opacity: 0.6 }}>•</span>
                              ) : (
                                <FaCheckDouble style={{ fontSize: '10px' }} />
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Reactions */}
          <div className="messenger-reactions-strip" style={{ padding: '8px 20px' }}>
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="reaction-chip"
                onClick={() => handleAddReaction(emoji)}
                title={`Add ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Message Composer */}
          <form className="messenger-composer" onSubmit={handleSend} style={{ padding: '12px 20px 16px' }}>
            <input
              ref={inputRef}
              type="text"
              className="messenger-input"
              placeholder={`Type a message to ${activeChannel?.name || 'the department'}… (Press Enter to send)`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sendingMessage}
              style={{ fontSize: '14px', padding: '12px 20px' }}
            />
            <button
              type="submit"
              className="messenger-send-btn"
              disabled={!inputText.trim() || sendingMessage}
              title="Send Message"
              style={{ width: '42px', height: '42px', fontSize: '16px' }}
            >
              <FaPaperPlane />
            </button>
          </form>
        </section>

        {/* Right Column: Channel & Department Info */}
        <aside className="channel-details-panel">
          <div className="details-card">
            <div className={`details-avatar-lg ${activeMeta?.className || 'dept-general'}`}>
              <ActiveIcon />
            </div>
            <div className="details-name">{activeChannel?.name}</div>
            <div className="details-desc">
              {activeChannel?.description || 'Active department workspace channel.'}
            </div>
          </div>

          <div className="channel-members-box">
            <h4>Real-time Network</h4>
            <div className="member-pill-row">
              <span className="member-mini-dot" />
              <span>Real-time Polling: Connected</span>
            </div>
            <div className="member-pill-row">
              <span className="member-mini-dot" />
              <span>Presence Tracking: Active</span>
            </div>
          </div>

          <div className="channel-members-box">
            <h4>Quick Department Channels</h4>
            {channels
              .filter((c) => c.type === 'department')
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  style={{
                    background: c.id === activeChannel?.id ? 'var(--surface-strong)' : 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: 'var(--text)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  onClick={() => selectChannel(c.id)}
                >
                  <span>{c.name}</span>
                  {c.unread_count > 0 && (
                    <span className="channel-unread-pill">{c.unread_count}</span>
                  )}
                </button>
              ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
